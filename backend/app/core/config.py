"""
Application configuration using Pydantic Settings.
Manages environment variables and app-wide settings.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Application
    app_name: str = "JeevanAlert AI - CHW Clinical Decision Support"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # API
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000"]
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./chw_system.db"
    database_echo: bool = False
    
    # Model Paths
    models_dir: Path = Path("./models")

    # Model Configuration
    max_model_context_length: int = 4096
    model_temperature: float = 0.3
    ollama_model_name: str = "medgemma-chw"  # Fine-tuned CHW workflow model
    isic_ollama_model: str = "isic-medgemma" # Fine-tuned ISIC skin cancer model (Multimodal)
    chat_ollama_model: str = "medgemma-1.5-4b-it" # Pretrained jeevanalert Chat model
    max_image_size_mb: int = 10
    
    # RAG Configuration
    vector_store_path: Path = Path("./data/vector_store")
    chunk_size: int = 512
    chunk_overlap: int = 50
    
    # Security
    secret_key: str = "CHANGE_THIS_IN_PRODUCTION"
    encryption_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    
    # Observability
    langsmith_api_key: str | None = None
    enable_tracing: bool = False
    
    # Offline Mode
    offline_mode: bool = True  # Default to offline for CHW field use
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
