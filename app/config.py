from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    db_host: str = "127.0.0.1"
    db_port: int = Field(default=3306, ge=1, le=65535)
    db_name: str = "ecored"
    db_user: str = "ecored"
    db_password: SecretStr = SecretStr("")
    ingest_api_key: SecretStr = SecretStr("")


@lru_cache
def get_settings() -> Settings:
    return Settings()
