from fastapi import FastAPI

from ledgr.expenses import router as expenses_router


app = FastAPI(title="Ledgr API", version="0.1.0")


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(expenses_router)
