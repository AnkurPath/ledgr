from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ledgr.features.users import router as users_router
from ledgr.features.transactions.router import router as transactions_router


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

@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(users_router)

app.include_router(transactions_router)

