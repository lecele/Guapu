"""
main.py — Servidor FastAPI: IA Ensino Enfermagem Aplicada.

Endpoints:
  GET  /                  → Health check básico
  GET  /health            → Health check detalhado (Supabase, Checkpointer)
  GET  /session/{id}      → Recupera histórico de uma sessão (audit trail)
  POST /chat              → Chat com tutor CRAG + memória persistente
  POST /webhook/drive     → Recebe Push Notifications do Google Drive
  POST /admin/ingest/file → Ingere um PDF pelo ID do Drive
  POST /admin/ingest/sync → Sincroniza toda a pasta do Drive (background)

Autor: Agentes na Saúde — Projeto de Mestrado
"""

from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import time
import uuid
from contextlib import asynccontextmanager
from typing import Optional

import structlog
from fastapi import BackgroundTasks, FastAPI, HTTPException, Header, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import get_settings
from db.memory import (
    close_checkpointer,
    get_checkpointer,
    get_session_history,
    init_checkpointer,
    save_turn_to_audit,
)
from db.supabase_client import check_supabase_connection
from rag.graph import build_crag_graph  # GraphState é TypedDict interno — não importado diretamente
from rag.ingestion import IngestionResult, ingest_all_from_drive, ingest_pdf_from_bytes
from services.drive_service import download_pdf, get_file_metadata

# ==============================================================================
# LOGGING
# ==============================================================================

settings = get_settings()

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer()
        if settings.app_env == "development"
        else structlog.processors.JSONRenderer(),
    ],
)

logger = structlog.get_logger(__name__)

# ==============================================================================
# GRAFO (inicializado no lifespan com o checkpointer)
# ==============================================================================

# O grafo é construído no lifespan e armazenado aqui.
# Usar None antes da inicialização garante que erros de startup sejam explícitos.
_crag_graph = None


def get_graph():
    """Retorna o grafo CRAG compilado. Levanta erro se não inicializado."""
    if _crag_graph is None:
        raise RuntimeError(
            "Grafo CRAG não inicializado. "
            "Verifique se o lifespan da aplicação foi executado corretamente."
        )
    return _crag_graph


# ==============================================================================
async def run_daily_sync_scheduler():
    """
    Scheduler autônomo em background que roda a cada 24 horas.
    Dispara a sincronização total com o Google Drive para manter o RAG atualizado.
    """
    import asyncio
    import anyio
    
    logger.info("daily_sync_scheduler_started", interval_hours=24)
    # Aguarda 300 segundos (5 minutos) após a inicialização para não interferir no startup da API
    await asyncio.sleep(300)
    
    while True:
        try:
            logger.info("daily_sync_scheduler_triggering_sync")
            # Roda a ingestão em uma thread pool separada para não bloquear a API
            results = await anyio.to_thread.run_sync(ingest_all_from_drive)
            total_inserted = sum(r.chunks_inserted for r in results)
            logger.info(
                "daily_sync_scheduler_sync_complete",
                files_processed=len(results),
                total_chunks_inserted=total_inserted
            )
        except Exception as exc:
            logger.error("daily_sync_scheduler_error", error=str(exc))
            
        logger.info("daily_sync_scheduler_sleeping", sleep_seconds=86400)
        await asyncio.sleep(86400)


# ==============================================================================
# LIFESPAN — Startup & Shutdown
# ==============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gerencia o ciclo de vida da aplicação.

    Startup:
      1. Inicializa o checkpointer PostgreSQL (AsyncPostgresSaver via Supabase)
      2. Compila o grafo CRAG com o checkpointer injetado
      3. Verifica conexão com o Supabase
      4. Dispara a sincronização diária autônoma em background
    """
    global _crag_graph
    import asyncio

    logger.info("app_starting", env=settings.app_env, port=settings.app_port)

    # ── 1. Inicializa o checkpointer de memória ─────────────────────────────
    checkpointer = await init_checkpointer()
    checkpointer_type = type(checkpointer).__name__
    logger.info("checkpointer_initialized", type=checkpointer_type)

    # ── 2. Compila o grafo CRAG com o checkpointer ──────────────────────────
    _crag_graph = build_crag_graph(checkpointer=checkpointer)
    logger.info("crag_graph_ready")

    # ── 3. Verifica conexão com Supabase ────────────────────────────────────
    supabase_ok = await check_supabase_connection()
    if not supabase_ok:
        logger.warning(
            "supabase_unavailable_on_startup",
            message="Conexão com o Supabase falhou. Verifique SUPABASE_URL e SUPABASE_KEY.",
        )

    logger.info(
        "app_ready",
        supabase_connected=supabase_ok,
        checkpointer=checkpointer_type,
    )

    # ── 4. Dispara o scheduler autônomo em background ───────────────────────
    sync_task = asyncio.create_task(run_daily_sync_scheduler())

    yield  # ← Aplicação em execução

    # ── Shutdown ─────────────────────────────────────────────────────────────
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        logger.info("daily_sync_scheduler_stopped")

    await close_checkpointer()
    logger.info("app_shutdown_complete")


# ==============================================================================
# APLICAÇÃO FASTAPI
# ==============================================================================

app = FastAPI(
    title="IA Ensino Enfermagem Aplicada",
    description=(
        "Backend do chatbot educacional de enfermagem com CRAG (Corrective RAG) "
        "e memória de sessão persistente via LangGraph + Supabase. "
        "Projeto de Mestrado — Agentes na Saúde."
    ),
    version="0.2.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ==============================================================================
# MIDDLEWARES
# ==============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)


# ==============================================================================
# REQUEST / RESPONSE SCHEMAS (Pydantic v2)
# ==============================================================================

class ChatRequest(BaseModel):
    """
    Payload do endpoint /chat.

    O histórico de sessão (à chave `chat_history` do GraphState) é gerenciado
    internamente pelo LangGraph via `AsyncPostgresSaver` — o cliente NÃO precisa
    enviar o histórico na requisição. Basta enviar o `session_id` e a `message`.
    """
    session_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description=(
            "ID único da sessão do estudante. "
            "Use o mesmo ID para manter continuidade — o histórico da conversa "
            "é restaurado automaticamente pelo LangGraph."
        ),
        examples=["aluno-joao-2024", "sessao-abc123"],
    )
    message: str = Field(
        ...,
        min_length=3,
        max_length=2_000,
        description="Pergunta ou mensagem do estudante de enfermagem.",
        examples=["Quais são os principais sinais de choque hipovolêmico?"],
    )


class ChatResponse(BaseModel):
    """Resposta do endpoint /chat."""
    answer: str = Field(..., description="Resposta gerada pelo tutor de IA.")
    session_id: str = Field(..., description="ID da sessão usada.")
    sources_found: int = Field(
        ...,
        description="Número de chunks relevantes usados. 0 = resposta fallback.",
    )
    has_context: bool = Field(
        ...,
        description="True se documentos relevantes foram encontrados; False se fallback.",
    )
    chat_history_length: int = Field(
        ...,
        description="Número total de mensagens no histórico da sessão (após este turno).",
    )
    processing_time_ms: float = Field(..., description="Tempo total de processamento (ms).")


class HealthResponse(BaseModel):
    """Resposta do endpoint /health."""
    status: str
    version: str
    env: str
    supabase_connected: bool
    checkpointer_type: str
    timestamp: str


class SessionHistoryResponse(BaseModel):
    """Resposta do endpoint /session/{session_id}."""
    session_id: str
    messages: list[dict]
    total: int


class IngestFileRequest(BaseModel):
    """Payload para ingerir um arquivo específico pelo ID do Drive."""
    drive_file_id: str = Field(..., description="ID do arquivo no Google Drive.")
    chunk_size: int = Field(default=1000, ge=200, le=4000)
    chunk_overlap: int = Field(default=150, ge=0, le=500)


class IngestResultResponse(BaseModel):
    """Resposta dos endpoints de ingestion."""
    file_name: str
    file_id: str
    total_pages: int
    total_chunks: int
    chunks_inserted: int
    chunks_skipped: int
    success: bool
    errors: list[str]
    summary: str


# ==============================================================================
# ENDPOINTS — Status
# ==============================================================================

@app.get("/", tags=["Status"], summary="Ping")
async def root():
    """Verificação rápida — confirma que o servidor está no ar."""
    return {
        "status": "ok",
        "service": "IA Ensino Enfermagem Aplicada",
        "version": "0.2.0",
    }


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Status"],
    summary="Health Check Detalhado",
)
async def health_check():
    """
    Verificação detalhada do estado da aplicação.
    Testa conexão com o Supabase e informa o tipo de checkpointer ativo.
    """
    import datetime

    supabase_ok = await check_supabase_connection()

    try:
        checkpointer = get_checkpointer()
        checkpointer_type = type(checkpointer).__name__
    except RuntimeError:
        checkpointer_type = "not_initialized"

    return HealthResponse(
        status="healthy" if supabase_ok else "degraded",
        version="0.2.0",
        env=settings.app_env,
        supabase_connected=supabase_ok,
        checkpointer_type=checkpointer_type,
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
    )


# ==============================================================================
# ENDPOINTS — Chat com Memória Persistente
# ==============================================================================

@app.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    tags=["Chat"],
    summary="Chat com Tutor de Enfermagem — CRAG + Memória Persistente",
)
async def chat(request: ChatRequest) -> ChatResponse:
    """
    Endpoint principal do chatbot educacional com memória de sessão.

    ## Fluxo:
    1. **Contextualiza** a pergunta usando o histórico do `session_id`
    2. **Recupera** documentos relevantes do Supabase (pgvector)
    3. **Avalia** a relevância de cada documento (Gemini Flash)
    4. **Gera** resposta com contexto documental + histórico da conversa
    5. **Persiste** o estado completo via AsyncPostgresSaver (checkpoint)
    6. **Salva** a conversa no audit trail (chat_messages)

    ## Memória:
    O campo `session_id` é usado como `thread_id` no LangGraph.
    O histórico de mensagens é recuperado e persistido automaticamente.
    Não é necessário enviar o histórico nas requisições.
    """
    session_id = request.session_id
    start_time = time.perf_counter()

    logger.info(
        "chat_request_received",
        session_id=session_id,
        message_preview=request.message[:60],
    )

    # ── Estado inicial: apenas a nova pergunta ───────────────────────────────
    # O LangGraph restaura `chat_history`, `documents` e `generation`
    # automaticamente via checkpointer para o thread_id informado.
    # O reducer `operator.add` acumula o novo turno ao histórico existente.
    initial_input = {
        "question":     request.message,
        "documents":    [],
        "generation":   "",
        # chat_history NÃO precisa ser enviado — é restaurado do checkpoint
        # e acumulado via operator.add ao final do turno.
    }

    # ── Configuração: thread_id = session_id (chave para o checkpointer) ────
    graph_config = {"configurable": {"thread_id": session_id}}

    try:
        graph = get_graph()
        final_state: dict = await graph.ainvoke(initial_input, config=graph_config)

    except Exception as exc:
        logger.error(
            "chat_graph_error",
            session_id=session_id,
            error=str(exc),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Ocorreu um erro interno ao processar sua pergunta. "
                "Por favor, tente novamente em alguns instantes."
            ),
        )

    elapsed_ms = (time.perf_counter() - start_time) * 1000

    generation     = final_state.get("generation", "")
    documents      = final_state.get("documents", [])
    chat_history   = final_state.get("chat_history", [])
    has_context    = len(documents) > 0

    logger.info(
        "chat_request_done",
        session_id=session_id,
        has_context=has_context,
        docs_used=len(documents),
        history_len=len(chat_history),
        elapsed_ms=round(elapsed_ms, 2),
    )

    # ── Salva no audit trail (assíncrono — não bloqueia a resposta) ─────────
    audit_metadata = {
        "sources_found":      len(documents),
        "has_context":        has_context,
        "processing_time_ms": round(elapsed_ms, 2),
        "source_files":       list({d.metadata.get("source") for d in documents}),
    }

    import asyncio
    asyncio.create_task(
        save_turn_to_audit(
            session_id=session_id,
            user_message=request.message,
            ai_response=generation,
            ai_metadata=audit_metadata,
        )
    )

    return ChatResponse(
        answer=generation,
        session_id=session_id,
        sources_found=len(documents),
        has_context=has_context,
        chat_history_length=len(chat_history),
        processing_time_ms=round(elapsed_ms, 2),
    )


# ==============================================================================
# ENDPOINTS — Sessão / Histórico
# ==============================================================================

@app.get(
    "/session/{session_id}",
    response_model=SessionHistoryResponse,
    tags=["Chat"],
    summary="Recupera o histórico de uma sessão (audit trail)",
)
async def get_session(session_id: str, limit: int = 50) -> SessionHistoryResponse:
    """
    Retorna o histórico de mensagens de uma sessão a partir da tabela de audit trail.

    Útil para:
    - Exibir histórico no frontend
    - Análise acadêmica das conversas
    - Debugging e monitoramento

    Nota: Este endpoint consulta a tabela `chat_messages` (human-readable),
    não os checkpoints do LangGraph.
    """
    messages = await get_session_history(session_id=session_id, limit=limit)

    return SessionHistoryResponse(
        session_id=session_id,
        messages=messages,
        total=len(messages),
    )


# ==============================================================================
# ENDPOINTS — Webhook Google Drive
# ==============================================================================

@app.post(
    "/webhook/drive",
    status_code=status.HTTP_200_OK,
    tags=["Webhook"],
    summary="Recebe notificações Push do Google Drive",
)
async def drive_webhook(
    request: Request,
    x_goog_channel_id: Optional[str] = Header(None, alias="X-Goog-Channel-ID"),
    x_goog_resource_state: Optional[str] = Header(None, alias="X-Goog-Resource-State"),
    x_goog_resource_id: Optional[str] = Header(None, alias="X-Goog-Resource-ID"),
    x_goog_channel_token: Optional[str] = Header(None, alias="X-Goog-Channel-Token"),
):
    """
    Recebe Push Notifications da Google Drive API.

    Estados tratados:
    - `sync`:   Confirmação inicial do canal — nenhuma ação.
    - `add`:    Novo PDF adicionado → dispara ingestion em background.
    - `update`: PDF atualizado → re-ingere (idempotente via hash).
    - `remove`: PDF removido → TODO: remover chunks do Supabase.
    """
    # ── Validação do token secreto ────────────────────────────────────────────
    if settings.drive_webhook_secret:
        if x_goog_channel_token != settings.drive_webhook_secret:
            logger.warning(
                "drive_webhook_invalid_token",
                channel_id=x_goog_channel_id,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de webhook inválido.",
            )

    resource_state = x_goog_resource_state or "unknown"

    logger.info(
        "drive_webhook_received",
        channel_id=x_goog_channel_id,
        resource_state=resource_state,
        resource_id=x_goog_resource_id,
    )

    if resource_state == "sync":
        logger.info("drive_webhook_sync_ack")
        return {"status": "sync_acknowledged"}

    elif resource_state in ("add", "update"):
        file_meta = get_file_metadata(x_goog_resource_id)
        if file_meta and file_meta.get("mimeType") == "application/pdf":
            import asyncio

            async def _background_ingest():
                try:
                    pdf_bytes = download_pdf(x_goog_resource_id)
                    result = ingest_pdf_from_bytes(
                        pdf_bytes=pdf_bytes,
                        file_name=file_meta["name"],
                        file_id=x_goog_resource_id,
                    )
                    logger.info("drive_webhook_ingestion_done", summary=result.summary)
                except Exception as exc:
                    logger.error("drive_webhook_ingestion_error", error=str(exc))

            asyncio.create_task(_background_ingest())

        return {
            "status": "accepted",
            "message": f"Ingestion do arquivo '{resource_state}' iniciada em background.",
        }

    elif resource_state == "remove":
        logger.info(
            "drive_webhook_resource_removed",
            resource_id=x_goog_resource_id,
            todo="Implementar remoção de chunks no Supabase por drive_file_id",
        )
        return {
            "status": "accepted",
            "message": "Notificação de remoção recebida. Remoção de chunks pendente de implementação.",
        }

    return {"status": "received", "resource_state": resource_state}


# ==============================================================================
# ENDPOINTS — Admin / Ingestion
# ==============================================================================

@app.post(
    "/admin/ingest/file",
    response_model=IngestResultResponse,
    status_code=status.HTTP_200_OK,
    tags=["Admin"],
    summary="Ingere um arquivo PDF pelo ID do Google Drive",
)
async def admin_ingest_file(request: IngestFileRequest) -> IngestResultResponse:
    """
    Baixa e processa um arquivo PDF específico do Google Drive.

    Fluxo: Download → Extração de texto → Chunking → Embeddings → Supabase.
    Idempotente: re-executar não cria duplicatas (deduplicação por SHA-256).
    """
    logger.info("admin_ingest_file", drive_file_id=request.drive_file_id)

    try:
        file_meta = get_file_metadata(request.drive_file_id)
        if not file_meta:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Arquivo '{request.drive_file_id}' não encontrado no Google Drive.",
            )

        if file_meta.get("mimeType") != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"O arquivo '{file_meta['name']}' não é um PDF.",
            )

        pdf_bytes = download_pdf(request.drive_file_id)
        result: IngestionResult = ingest_pdf_from_bytes(
            pdf_bytes=pdf_bytes,
            file_name=file_meta["name"],
            file_id=request.drive_file_id,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("admin_ingest_file_error", error=str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro durante a ingestion: {str(exc)}",
        )

    return IngestResultResponse(
        file_name=result.file_name,
        file_id=result.file_id,
        total_pages=result.total_pages,
        total_chunks=result.total_chunks,
        chunks_inserted=result.chunks_inserted,
        chunks_skipped=result.chunks_skipped,
        success=result.success,
        errors=result.errors,
        summary=result.summary,
    )


@app.post(
    "/admin/ingest/sync",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Admin"],
    summary="Sincroniza toda a pasta do Google Drive (background)",
)
async def admin_ingest_sync(background_tasks: BackgroundTasks):
    """
    Varre toda a pasta do Google Drive (DRIVE_FOLDER_ID) e ingere todos os PDFs.
    Idempotente — arquivos já processados são ignorados automaticamente.
    Retorna 202 imediatamente enquanto a sync acontece em background.
    """
    logger.info("admin_ingest_sync_triggered")

    def _run_sync():
        results = ingest_all_from_drive()
        total_inserted = sum(r.chunks_inserted for r in results)
        logger.info(
            "admin_ingest_sync_complete",
            files=len(results),
            total_inserted=total_inserted,
        )

    background_tasks.add_task(_run_sync)

    return {
        "status": "accepted",
        "message": "Sincronização iniciada em background. Verifique os logs para acompanhar o progresso.",
    }


# ==============================================================================
# EXCEPTION HANDLERS
# ==============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handler global para exceções não capturadas."""
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Erro interno do servidor. Consulte os logs para mais detalhes."},
    )


# ==============================================================================
# ENTRYPOINT
# ==============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        log_level=settings.app_log_level,
        reload=not settings.is_production,
        access_log=True,
    )
