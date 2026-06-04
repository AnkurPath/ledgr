from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()

@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "LEDGR_DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/ledgr",
    )


settings = Settings()
