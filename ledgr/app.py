from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session

from ledgr.core.config import settings
from ledgr.core.db import engine
from ledgr.core.ratelimit import limiter
from ledgr.features.goals.router import router as goals_router
from ledgr.features.users.router import router as users_router
from ledgr.features.investments.router import router as investments_router
from ledgr.features.transactions.router import router as transactions_router
from ledgr.utils.globaldata import seed_all_globals


app = FastAPI(title="Ledgr API", version="0.1.0")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],)


@app.on_event("startup")
def seed_default_reference_data() -> None:
    if getattr(app.state, "test_engine", None) is not None:
        return
    with Session(engine) as session:
        seed_all_globals(session)

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(users_router)

app.include_router(transactions_router)

app.include_router(investments_router)

app.include_router(goals_router)

