from dataclasses import dataclass, field
import os
import secrets

from dotenv import load_dotenv


load_dotenv()

_TRUE_VALUES = {"1", "true", "yes", "on"}
_DEV_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5433/ledgr"


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in _TRUE_VALUES


def _resolve_jwt_secret(environment: str) -> str:
    secret = os.getenv("LEDGR_JWT_SECRET_KEY")
    if secret:
        return secret
    if environment == "production":
        raise RuntimeError(
            "LEDGR_JWT_SECRET_KEY must be set in production. Generate one with: "
            'python -c "import secrets; print(secrets.token_hex(32))"'
        )
    # Outside production, fall back to a random per-process secret so tokens are
    # never signed with a predictable/shared default key.
    return secrets.token_hex(32)


def _resolve_database_url(environment: str) -> str:
    url = os.getenv("LEDGR_DATABASE_URL")
    if url:
        return url
    if environment == "production":
        raise RuntimeError("LEDGR_DATABASE_URL must be set in production.")
    return _DEV_DATABASE_URL


def _resolve_cors_origins() -> tuple[str, ...]:
    raw = os.getenv("LEDGR_CORS_ORIGINS")
    if not raw:
        return ("http://localhost:3000",)
    return tuple(origin.strip() for origin in raw.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    jwt_secret_key: str
    algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    rate_limit_enabled: bool
    auth_rate_limit: str
    cors_origins: tuple[str, ...] = field(default_factory=tuple)


def _load_settings() -> Settings:
    environment = os.getenv("LEDGR_ENV", "development").strip().lower()
    return Settings(
        environment=environment,
        database_url=_resolve_database_url(environment),
        jwt_secret_key=_resolve_jwt_secret(environment),
        algorithm=os.getenv("ALGORITHM", "HS256"),
        access_token_expire_minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")),
        refresh_token_expire_days=int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30")),
        rate_limit_enabled=_get_bool("LEDGR_RATE_LIMIT_ENABLED", True),
        auth_rate_limit=os.getenv("LEDGR_AUTH_RATE_LIMIT", "10/minute"),
        cors_origins=_resolve_cors_origins(),
    )


settings = _load_settings()
