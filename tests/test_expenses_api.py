import os

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from ledgr.app import app
from ledgr.core.db import get_session
import ledgr.models  # noqa: F401


def make_test_client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(bind=engine)

    def override_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    return TestClient(app)


def test_expense_crud_flow() -> None:
    client = make_test_client()

    created = client.post(
        "/expenses",
        json={
            "expense_date": "2026-06-03",
            "description": "Coffee",
            "amount": "4.50",
            "category": "Food",
            "payment_method": "Card",
        },
    )
    assert created.status_code == 201
    expense = created.json()
    assert expense["id"] == 1
    assert expense["amount"] == "4.50"

    listed = client.get("/expenses", params={"expense_date": "2026-06-03"})
    assert listed.status_code == 200
    assert [item["description"] for item in listed.json()] == ["Coffee"]

    patched = client.patch(f"/expenses/{expense['id']}", json={"amount": "5.25"})
    assert patched.status_code == 200
    assert patched.json()["amount"] == "5.25"

    fetched = client.get(f"/expenses/{expense['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["amount"] == "5.25"

    deleted = client.delete(f"/expenses/{expense['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/expenses/{expense['id']}").status_code == 404


def test_daily_summary_groups_expenses_by_date() -> None:
    client = make_test_client()

    for payload in [
        {"expense_date": "2026-06-03", "description": "Coffee", "amount": "4.50"},
        {"expense_date": "2026-06-03", "description": "Lunch", "amount": "12.00"},
        {"expense_date": "2026-06-02", "description": "Train", "amount": "3.25"},
    ]:
        response = client.post("/expenses", json=payload)
        assert response.status_code == 201

    summary = client.get("/expenses/summary/daily")
    assert summary.status_code == 200
    assert summary.json() == [
        {"expense_date": "2026-06-03", "total_amount": "16.50", "expense_count": 2},
        {"expense_date": "2026-06-02", "total_amount": "3.25", "expense_count": 1},
    ]
