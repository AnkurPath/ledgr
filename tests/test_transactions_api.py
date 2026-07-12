import os

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"
os.environ["LEDGR_RATE_LIMIT_ENABLED"] = "false"

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


def create_account(
    client: TestClient,
    token: str,
    opening_balance: str = "100.00",
    name: str = "Wallet",
) -> dict:
    response = client.post(
        "/users/setup/accounts",
        json={"name": name, "account_type": "wallet", "opening_balance": opening_balance},
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


def create_category(client: TestClient, token: str, kind: str, name: str) -> dict:
    response = client.post(
        "/users/setup/categories",
        json={"kind": kind, "name": name},
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
    assert expense.json()["message"] == "Expense transaction created"
    assert expense.json()["transactions"][0]["amount"] == "25.50"

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
    assert income.json()["message"] == "Income transaction created"

    transactions = client.get("/transactions", headers=headers)
    accounts = client.get("/users/setup/accounts", headers=headers)
    balances = {item["name"]: item["current_balance"] for item in accounts.json()}

    assert [item["transaction_type"] for item in transactions.json()] == ["INCOME", "EXPENSE"]
    assert balances["Wallet"] == "84.50"


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


def test_allows_duplicate_same_amount_transactions() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token)
    payload = {
        "date": "2026-06-28T10:00:00+00:00",
        "merchant": "Coffee Bar",
        "amount": "10.00",
        "account_id": account["id"],
        "transaction_type": "EXPENSE",
    }

    first = client.post("/transactions", json=payload, headers=auth_headers(token))
    second = client.post("/transactions", json=payload, headers=auth_headers(token))

    assert first.status_code == 200
    assert second.status_code == 200
    transactions = client.get("/transactions", headers=auth_headers(token)).json()
    assert len(transactions) == 2


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


def test_transfer_transaction_moves_money_between_owned_accounts() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    source = create_account(client, token, opening_balance="100.00", name="Checking")
    destination = create_account(client, token, opening_balance="25.00", name="Savings")
    category = create_category(client, token, "transfer", "A/C Transfer")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "40.00",
            "source_account_id": source["id"],
            "destination_account_id": destination["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
            "notes": "Move money",
        },
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Transfer successful"
    assert body["amount_transferred"] == "40.00"
    assert [item["amount"] for item in body["transactions"]] == ["-40.00", "40.00"]
    assert [item["merchant"] for item in body["transactions"]] == ["Transfer to Savings", "Transfer from Checking"]

    accounts = client.get("/users/setup/accounts", headers=headers).json()
    balances = {account["name"]: account["current_balance"] for account in accounts}
    assert balances["Checking"] == "60.00"
    assert balances["Savings"] == "65.00"


def test_transfer_rejects_same_account() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token)
    category = create_category(client, token, "transfer", "A/C Transfer")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "10.00",
            "source_account_id": account["id"],
            "destination_account_id": account["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Cannot transfer money to the same account"


def test_transfer_rejects_insufficient_source_funds() -> None:
    client = make_test_client()
    token = register_user(client)
    source = create_account(client, token, opening_balance="5.00", name="Checking")
    destination = create_account(client, token, opening_balance="25.00", name="Savings")
    category = create_category(client, token, "transfer", "A/C Transfer")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "10.00",
            "source_account_id": source["id"],
            "destination_account_id": destination["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient funds in the source account"


def test_transfer_accounts_must_belong_to_current_user() -> None:
    client = make_test_client()
    owner_token = register_user(client, "owner@example.com")
    other_token = register_user(client, "other@example.com")
    owner_account = create_account(client, owner_token, name="Owner")
    other_account = create_account(client, other_token, name="Other")
    category = create_category(client, owner_token, "transfer", "A/C Transfer")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "10.00",
            "source_account_id": owner_account["id"],
            "destination_account_id": other_account["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
        },
        headers=auth_headers(owner_token),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Destination account not found or not authorized"


def test_credit_card_transfer_category_creates_single_transaction_without_account_transfer() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="100.00", name="Checking")
    category = create_category(client, token, "transfer", "Credit Card")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "30.00",
            "account_id": account["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["message"] == "Transfer transaction created"
    assert body["amount_transferred"] is None
    assert len(body["transactions"]) == 1
    assert body["transactions"][0]["account_id"] == account["id"]
    assert body["transactions"][0]["amount"] == "-30.00"

    accounts = client.get("/users/setup/accounts", headers=auth_headers(token)).json()
    balances = {account["name"]: account["current_balance"] for account in accounts}
    assert balances["Checking"] == "70.00"


def test_investment_transaction_debits_balance() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="1000.00", name="Invest Wallet")
    category = create_category(client, token, "investment", "Mutual Funds")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "250.00",
            "account_id": account["id"],
            "transaction_type": "INVESTMENT",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Investment transaction created"
    accounts = client.get("/users/setup/accounts", headers=auth_headers(token)).json()
    balances = {item["name"]: item["current_balance"] for item in accounts}
    assert balances["Invest Wallet"] == "750.00"


def test_refund_transaction_credits_balance() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="100.00", name="Refund Wallet")
    category = create_category(client, token, "refund", "Tax Refund")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "45.00",
            "account_id": account["id"],
            "transaction_type": "REFUND",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Refund transaction created"
    accounts = client.get("/users/setup/accounts", headers=auth_headers(token)).json()
    balances = {item["name"]: item["current_balance"] for item in accounts}
    assert balances["Refund Wallet"] == "145.00"


def test_refund_can_use_expense_category_and_needs_tag() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    account = create_account(client, token, opening_balance="100.00", name="Refund Wallet")
    expense_category = create_category(client, token, "expense", "Food & Drinks")
    tag = client.post(
        "/users/setup/tags",
        json={"name": "Needs", "color": "#FF6347"},
        headers=headers,
    )
    assert tag.status_code == 201

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "25.00",
            "account_id": account["id"],
            "transaction_type": "REFUND",
            "category_id": expense_category["id"],
            "tag_id": tag.json()["id"],
        },
        headers=headers,
    )

    assert response.status_code == 200
    created = response.json()["transactions"][0]
    assert created["transaction_type"] == "REFUND"
    assert created["category_id"] == expense_category["id"]
    assert created["tag_id"] == tag.json()["id"]

    accounts = client.get("/users/setup/accounts", headers=headers).json()
    balances = {item["name"]: item["current_balance"] for item in accounts}
    assert balances["Refund Wallet"] == "125.00"


def test_single_account_transfer_rejects_insufficient_funds() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="20.00", name="Checking")
    category = create_category(client, token, "transfer", "Credit Card")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "30.00",
            "account_id": account["id"],
            "transaction_type": "TRANSFER",
            "category_id": category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient funds in the selected account"


def test_transaction_rejects_category_kind_mismatch() -> None:
    client = make_test_client()
    token = register_user(client)
    account = create_account(client, token, opening_balance="500.00", name="Primary")
    expense_category = create_category(client, token, "expense", "Food & Drinks")

    response = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "50.00",
            "account_id": account["id"],
            "transaction_type": "INCOME",
            "category_id": expense_category["id"],
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Selected category kind must be 'income' for INCOME transactions"


def test_update_transaction_recalculates_balance_for_same_account() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    account = create_account(client, token, opening_balance="100.00", name="Wallet")
    expense_category = create_category(client, token, "expense", "Food & Drinks")
    refund_category = create_category(client, token, "refund", "Tax Refund")

    created = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "20.00",
            "account_id": account["id"],
            "transaction_type": "EXPENSE",
            "category_id": expense_category["id"],
        },
        headers=headers,
    )
    assert created.status_code == 200
    transaction_id = created.json()["transactions"][0]["id"]

    updated = client.patch(
        f"/transactions/{transaction_id}",
        json={
            "amount": "30.00",
            "transaction_type": "REFUND",
            "category_id": refund_category["id"],
        },
        headers=headers,
    )
    assert updated.status_code == 200

    accounts = client.get("/users/setup/accounts", headers=headers).json()
    balances = {item["name"]: item["current_balance"] for item in accounts}
    assert balances["Wallet"] == "130.00"


def test_update_transaction_recalculates_balance_when_account_changes() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    source = create_account(client, token, opening_balance="100.00", name="Source")
    destination = create_account(client, token, opening_balance="200.00", name="Destination")
    expense_category = create_category(client, token, "expense", "Food & Drinks")

    created = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "20.00",
            "account_id": source["id"],
            "transaction_type": "EXPENSE",
            "category_id": expense_category["id"],
        },
        headers=headers,
    )
    assert created.status_code == 200
    transaction_id = created.json()["transactions"][0]["id"]

    updated = client.patch(
        f"/transactions/{transaction_id}",
        json={"account_id": destination["id"], "amount": "40.00"},
        headers=headers,
    )
    assert updated.status_code == 200

    accounts = client.get("/users/setup/accounts", headers=headers).json()
    balances = {item["name"]: item["current_balance"] for item in accounts}
    assert balances["Source"] == "100.00"
    assert balances["Destination"] == "160.00"
