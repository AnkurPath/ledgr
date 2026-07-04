from dataclasses import dataclass
import os

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("LEDGR_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5433/ledgr")
    jwt_secret_key: str = os.getenv("LEDGR_JWT_SECRET_KEY", "dev-only-change-me")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))


settings = Settings()
