from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql://tradewithcongress:tradewithcongress@localhost:5432/tradewithcongress"
    )
    document_storage_dir: Path = Path("../data/documents")

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
