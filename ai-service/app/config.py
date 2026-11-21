from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_PAGES = 500
CHUNK_TOKENS = 400
OVERLAP = 60
BATCH_SIZE = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8", extra="ignore", hide_input_in_errors=True,
    )
    mongodb_uri: SecretStr = Field(min_length=1)
    mongodb_db: str = Field(default="docchat", min_length=1)
    vector_index: str = Field(default="chunk_embeddings", min_length=1)
    internal_key: SecretStr = Field(min_length=1)
    llm_provider: Literal["groq", "gemini"] = "groq"
    groq_api_key: SecretStr = SecretStr("")
    gemini_api_key: SecretStr = SecretStr("")
    groq_model: str = Field(default="openai/gpt-oss-20b", min_length=1)
    gemini_model: str = Field(default="gemini-3.5-flash-lite", pattern=r"^[\w.-]+$")
    llm_timeout_seconds: float = Field(default=60, gt=0, allow_inf_nan=False)
    rerank_threshold: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode="after")
    def check_provider_key(self):
        key = self.groq_api_key if self.llm_provider == "groq" else self.gemini_api_key
        if not key.get_secret_value().strip():
            raise ValueError(f"Set {self.llm_provider.upper()}_API_KEY")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
