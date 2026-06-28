import os

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

import ledgr.models  # noqa: F401
from ledgr.app import app
from ledgr.core.db import get_session


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

    app.dependency_overrides.clear()
    app.dependency_overrides[get_session] = override_session
    return TestClient(app)


def register_user(client: TestClient, email: str = "ankur@example.com") -> str:
    response = client.post(
        "/users/register",
        json={
            "email": email,
            "password": "pass1234",
            "first_name": "Ankur",
            "last_name": "Test",
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_account(client: TestClient, token: str, opening_balance: str = "100.00") -> dict:
    response = client.post(
        "/users/setup/accounts",
        json={"name": "Wallet", "account_type": "Cash", "opening_balance": opening_balance},
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


def test_create_transactions_updates_account_balance() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    account = create_account(client, token)

    expense = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "merchant": "Coffee Bar",
            "amount": "25.50",
            "account_id": account["id"],
            "transaction_type": "EXPENSE",
        },
        headers=headers,
    )
    assert expense.status_code == 200
    assert expense.json()["amount"] == "25.50"

    income = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T11:00:00+00:00",
            "merchant": "Client",
            "amount": "10.00",
            "account_id": account["id"],
            "transaction_type": "INCOME",
        },
        headers=headers,
    )
    assert income.status_code == 200

    transactions = client.get("/transactions", headers=headers)
    accounts = client.get("/users/setup/accounts", headers=headers)

    assert [item["transaction_type"] for item in transactions.json()] == ["EXPENSE", "INCOME"]
    assert accounts.json()[0]["current_balance"] == "84.50"


def test_expense_transaction_rejects_insufficient_funds() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="5.00")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "10.00",
            "account_id": account["id"],
            "transaction_type": "EXPENSE",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient funds in the selected account"


def test_transaction_account_must_belong_to_current_user() -> None:
    client = make_test_client()
    owner_token = register_user(client, "owner@example.com")
    other_token = register_user(client, "other@example.com")
    owner_account = create_account(client, owner_token)

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "1.00",
            "account_id": owner_account["id"],
            "transaction_type": "EXPENSE",
        },
        headers=auth_headers(other_token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Account not found or not authorized"
