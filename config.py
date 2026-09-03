"""
config.py — Configurações centralizadas via Pydantic Settings.
Carrega variáveis do .env automaticamente.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """
    Centraliza toda a configuração da aplicação.
    Pydantic valida e converte os tipos automaticamente.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Google AI ─────────────────────────────────────────────────────────────
    google_api_key: str = Field(..., description="API Key do Google AI Studio")
    google_service_account_file: str = Field(
        default="",
        description="Caminho para o JSON da Service Account (Google Drive API)",
    )
    google_service_account_json: str = Field(
        default="",
        description="JSON da Service Account injetado como segredo em CI/produção",
    )

    # ─── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str = Field(..., description="URL do projeto Supabase")
    supabase_key: str = Field(
        default="",
        description="Chave anon do Supabase usada pelo aplicativo",
    )
    supabase_service_role_key: str = Field(
        default="",
        description="Chave service_role usada somente pelos processos server-side",
    )
    supabase_db_url: str = Field(default="", description="URL de conexão direta ao PostgreSQL")
    supabase_direct_ingestion: bool = Field(
        default=False,
        description="Usa a conexão PostgreSQL direta para a ingestão server-side",
    )

    # ─── Google Drive ──────────────────────────────────────────────────────────
    drive_webhook_secret: str = Field(default="", description="Token secreto para validar webhooks do Drive")
    drive_channel_id: str = Field(default="", description="ID do canal de notificação do Drive")
    drive_folder_id: str = Field(default="", description="ID da pasta no Google Drive com PDFs")

    # ─── Aplicação ─────────────────────────────────────────────────────────────
    app_env: str = Field(default="development", description="Ambiente: development | production")
    app_host: str = Field(default="0.0.0.0")
    app_port: int = Field(default=8000)
    app_log_level: str = Field(default="info")

    # ─── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = Field(
        default="http://localhost:3000",
        description="Origens permitidas separadas por vírgula",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Converte a string de origens em lista."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # ─── RAG ───────────────────────────────────────────────────────────────────
    rag_match_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    rag_match_count: int = Field(default=5, ge=1, le=20)
    rag_table_name: str = Field(default="documents")

    # ─── Ingestion ─────────────────────────────────────────────────────────────
    ingestion_chunk_size: int = Field(default=1000, ge=200, le=4000)
    ingestion_chunk_overlap: int = Field(default=150, ge=0, le=500)
    ingestion_batch_size: int = Field(default=20, ge=1, le=100)
    ingestion_batch_delay_seconds: float = Field(
        default=1.5,
        ge=0.0,
        le=30.0,
        description="Pausa entre lotes de embedding para nao estourar a cota da API do Gemini",
    )
    drive_sync_max_files: int = Field(
        default=10,
        ge=1,
        le=1000,
        description="Máximo de arquivos novos/alterados processados por execução",
    )

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Retorna a instância singleton das configurações.
    O cache garante que o .env seja lido apenas uma vez.
    """
    return Settings()
