from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from ledgr.core.db import engine
from ledgr.features.goals.router import router as goals_router
from ledgr.features.users.router import router as users_router
from ledgr.features.investments.router import router as investments_router
from ledgr.features.transactions.router import router as transactions_router
from ledgr.utils.globaldata import seed_all_globals


app = FastAPI(title="Ledgr API", version="0.1.0")

origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

