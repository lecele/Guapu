"""
services/drive_service.py — Integração com a Google Drive API.

Responsável por:
- Autenticar com a Service Account do Google
- Listar PDFs na pasta monitorada
- Baixar o conteúdo binário de um arquivo pelo seu ID
- Verificar se um arquivo já foi processado (via metadata no Supabase)
"""

from __future__ import annotations

import io
import json
from functools import lru_cache
from typing import Optional

import structlog
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from config import get_settings

logger = structlog.get_logger(__name__)

# Escopos necessários para leitura dos arquivos do Drive
_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


@lru_cache(maxsize=1)
def get_drive_service():
    """
    Retorna o cliente autenticado do Google Drive API (Singleton).

    Autenticação via Service Account (arquivo JSON de credenciais).
    A variável GOOGLE_SERVICE_ACCOUNT_FILE deve apontar para o arquivo .json.

    Returns:
        Resource: Cliente autenticado da Drive API v3.

    Raises:
        FileNotFoundError: Se o arquivo de credenciais não existir.
        ValueError: Se GOOGLE_SERVICE_ACCOUNT_FILE não estiver configurado.
    """
    import os
    settings = get_settings()
    service_account_path = settings.google_service_account_file

    if service_account_path and os.path.exists(service_account_path):
        logger.info("drive_service_authenticating_service_account_file")
        credentials = service_account.Credentials.from_service_account_file(
            service_account_path,
            scopes=_SCOPES,
        )
        service = build("drive", "v3", credentials=credentials, cache_discovery=False)
    elif settings.google_service_account_json:
        logger.info("drive_service_authenticating_service_account_json")
        credentials = service_account.Credentials.from_service_account_info(
            json.loads(settings.google_service_account_json),
            scopes=_SCOPES,
        )
        service = build("drive", "v3", credentials=credentials, cache_discovery=False)
    else:
        raise ValueError(
            "Configure GOOGLE_SERVICE_ACCOUNT_FILE ou GOOGLE_SERVICE_ACCOUNT_JSON para acessar o Drive."
        )

    logger.info("drive_service_initialized")
    return service


def list_subfolders(folder_id: str) -> list[dict]:
    """
    Lista todas as subpastas dentro de uma pasta do Google Drive.

    Args:
        folder_id: ID da pasta pai.

    Returns:
        Lista de dicts com { id, name }.
    """
    service = get_drive_service()
    query = (
        f"'{folder_id}' in parents "
        "and mimeType='application/vnd.google-apps.folder' "
        "and trashed=false"
    )
    results = (
        service.files()
        .list(q=query, pageSize=100, fields="files(id, name)")
        .execute()
    )
    return results.get("files", [])


def list_pdf_files(folder_id: str, recursive: bool = True) -> list[dict]:
    """
    Lista todos os arquivos de interesse (PDF, DOCX, Google Docs) dentro da pasta
    especificada no Google Drive. Se recursive=True, varre subpastas recursivamente sem limite de nível.

    Args:
        folder_id: ID da pasta no Google Drive.
        recursive: Se True, busca em subpastas recursivamente.

    Returns:
        Lista de dicts com { id, name, mimeType, modifiedTime, size }.
    """
    service = get_drive_service()
    all_files = []

    # Tipos de arquivos suportados
    supported_mimetypes = {
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
        "application/vnd.google-apps.document",  # Google Docs
    }

    visited_folders: set[str] = set()

    def _crawl(fid: str, folder_path: str = "ROOT"):
        if fid in visited_folders:
            return
        visited_folders.add(fid)
        query = f"'{fid}' in parents and trashed=false"
        try:
            page_token = None
            while True:
                results = (
                    service.files()
                    .list(
                        q=query,
                        pageSize=1000,
                        pageToken=page_token,
                        supportsAllDrives=True,
                        includeItemsFromAllDrives=True,
                        fields="nextPageToken, files(id, name, mimeType, modifiedTime, size, md5Checksum)",
                    )
                    .execute()
                )

                for drive_file in results.get("files", []):
                    mimetype = drive_file.get("mimeType", "")
                    child_id = drive_file.get("id")
                    child_name = drive_file.get("name", "")
                    child_path = f"{folder_path}/{child_name}"

                    if mimetype == "application/vnd.google-apps.folder":
                        if recursive:
                            logger.info("drive_scanning_subfolder", path=child_path, id=child_id)
                            _crawl(child_id, child_path)
                    elif mimetype in supported_mimetypes:
                        drive_file["drive_path"] = child_path
                        all_files.append(drive_file)

                page_token = results.get("nextPageToken")
                if not page_token:
                    break
        except Exception as e:
            logger.error("drive_crawl_error", folder_id=fid, folder_path=folder_path, error=str(e))
            raise

    _crawl(folder_id)
    logger.info("drive_list_documents_total", folder_id=folder_id, total=len(all_files))
    return all_files


def download_pdf(file_id: str) -> bytes:
    """
    Baixa o conteúdo binário de um arquivo do Google Drive.
    Se for um Google Doc, exporta para PDF antes do download.

    Args:
        file_id: ID único do arquivo no Google Drive.

    Returns:
        Conteúdo do arquivo em bytes.

    Raises:
        Exception: Em caso de erro no download.
    """
    service = get_drive_service()

    # Busca metadados para verificar se é um Google Doc
    metadata = get_file_metadata(file_id)
    mime_type = metadata.get("mimeType", "") if metadata else ""

    if mime_type == "application/vnd.google-apps.document":
        logger.info("drive_exporting_gdoc", file_id=file_id)
        request = service.files().export_media(fileId=file_id, mimeType="application/pdf")
    else:
        logger.info("drive_downloading_file", file_id=file_id, mime_type=mime_type)
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            logger.debug(
                "drive_download_progress",
                file_id=file_id,
                progress=f"{int(status.progress() * 100)}%",
            )

    file_bytes = buffer.getvalue()
    logger.info("drive_download_done", file_id=file_id, size_kb=len(file_bytes) // 1024)
    return file_bytes


def get_file_metadata(file_id: str) -> Optional[dict]:
    """
    Retorna os metadados de um arquivo específico do Drive.

    Args:
        file_id: ID único do arquivo.

    Returns:
        Dict com metadados ou None se não encontrado.
    """
    try:
        service = get_drive_service()
        metadata = (
            service.files()
            .get(
                fileId=file_id,
                supportsAllDrives=True,
                fields="id, name, mimeType, modifiedTime, size, md5Checksum, trashed, parents",
            )
            .execute()
        )
        return metadata
    except Exception as exc:
        logger.error("drive_get_metadata_error", file_id=file_id, error=str(exc))
        return None
