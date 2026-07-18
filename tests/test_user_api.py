import os

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"
os.environ["LEDGR_RATE_LIMIT_ENABLED"] = "false"

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

import ledgr.models  # noqa: F401
from ledgr.app import app
from ledgr.core.db import get_session
from ledgr.features.users.models import CategoryModel
from ledgr.utils.globaldata import DEFAULT_CATEGORIES, seed_global_categories


def make_test_client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(bind=engine)
    app.state.test_engine = engine

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


def test_register_user_returns_token_and_profile() -> None:
    client = make_test_client()
    token = register_user(client)

    profile = client.get("/users/me", headers=auth_headers(token))
    accounts = client.get("/users/setup/accounts", headers=auth_headers(token))

    assert profile.status_code == 200
    assert profile.json()["email"] == "ankur@example.com"
    assert profile.json()["display_name"] == "Ankur Test"
    assert accounts.status_code == 200
    assert [account["name"] for account in accounts.json()] == ["Cash", "Pending from Friends"]
    assert [account["current_balance"] for account in accounts.json()] == ["0.00", "0.00"]


def test_login_and_refresh_token_rotation() -> None:
    client = make_test_client()
    register_response = client.post(
        "/users/register",
        json={
            "email": "refresh@example.com",
            "password": "pass1234",
            "first_name": "Refresh",
            "last_name": "User",
        },
    )
    assert register_response.status_code == 201
    register_body = register_response.json()
    assert register_body["refresh_token"]
    assert register_body["expires_in"] == 30 * 60

    login_response = client.post(
        "/users/token",
        data={"username": "refresh@example.com", "password": "pass1234"},
    )
    assert login_response.status_code == 200
    login_body = login_response.json()
    old_refresh = login_body["refresh_token"]

    refresh_response = client.post("/users/refresh", json={"refresh_token": old_refresh})
    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()
    assert refresh_body["access_token"]
    assert refresh_body["refresh_token"]
    assert refresh_body["refresh_token"] != old_refresh

    me = client.get("/users/me", headers=auth_headers(refresh_body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "refresh@example.com"

    reused = client.post("/users/refresh", json={"refresh_token": old_refresh})
    assert reused.status_code == 401


def test_logout_revokes_refresh_token() -> None:
    client = make_test_client()
    register_response = client.post(
        "/users/register",
        json={
            "email": "logout@example.com",
            "password": "pass1234",
            "first_name": "Log",
            "last_name": "Out",
        },
    )
    assert register_response.status_code == 201
    refresh_token = register_response.json()["refresh_token"]

    logout_response = client.post("/users/logout", json={"refresh_token": refresh_token})
    assert logout_response.status_code == 204

    refresh_response = client.post("/users/refresh", json={"refresh_token": refresh_token})
    assert refresh_response.status_code == 401


def test_setup_resources_are_scoped_to_current_user() -> None:
    client = make_test_client()
    first_token = register_user(client, "first@example.com")
    second_token = register_user(client, "second@example.com")

    first_account = client.post(
        "/users/setup/accounts",
        json={"name": "Savings", "account_type": "bank account", "opening_balance": "1500.50"},
        headers=auth_headers(first_token),
    )
    assert first_account.status_code == 201

    second_account = client.post(
        "/users/setup/accounts",
        json={"name": "Savings", "account_type": "bank account", "opening_balance": "100.00"},
        headers=auth_headers(second_token),
    )
    assert second_account.status_code == 201

    duplicate = client.post(
        "/users/setup/accounts",
        json={"name": "Savings", "account_type": "bank account"},
        headers=auth_headers(first_token),
    )
    assert duplicate.status_code == 409

    first_accounts = client.get("/users/setup/accounts", headers=auth_headers(first_token))
    second_accounts = client.get("/users/setup/accounts", headers=auth_headers(second_token))

    assert [item["name"] for item in first_accounts.json()] == ["Cash", "Pending from Friends", "Savings"]
    assert [item["name"] for item in second_accounts.json()] == ["Cash", "Pending from Friends", "Savings"]
    assert first_accounts.json()[2]["id"] != second_accounts.json()[2]["id"]


def test_account_model_supports_credit_card_fields() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    created = client.post(
        "/users/setup/accounts",
        json={
            "name": "HDFC Credit Card",
            "account_type": "credit card",
            "opening_balance": "2500.00",
            "card_number": "1234567812345678",
            "expiration_date": "2028-12-31T00:00:00+00:00",
            "credit_limit": "100000.00",
            "billing_cycle_start": 1,
            "billing_cycle_end": 25,
        },
        headers=headers,
    )

    assert created.status_code == 201
    body = created.json()
    assert body["account_type"] == "credit card"
    assert body["current_balance"] == "2500.00"
    assert body["card_number"] == "************5678"
    assert body["credit_limit"] == "100000.00"
    assert body["billing_cycle_start"] == 1
    assert body["billing_cycle_end"] == 25

    updated = client.patch(
        f"/users/setup/accounts/{body['id']}",
        json={"credit_limit": "120000.00", "billing_cycle_end": 28},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["credit_limit"] == "120000.00"
    assert updated.json()["billing_cycle_end"] == 28


def test_account_notes_can_be_created_and_updated() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    created = client.post(
        "/users/setup/accounts",
        json={
            "name": "Travel Wallet",
            "account_type": "wallet",
            "opening_balance": "500.00",
            "notes": "Used during trips",
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["notes"] == "Used during trips"

    updated = client.patch(
        f"/users/setup/accounts/{created.json()['id']}",
        json={"notes": "Used for travel and dining"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Used for travel and dining"


def test_bank_account_and_wallet_reject_credit_card_fields() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    bank_response = client.post(
        "/users/setup/accounts",
        json={
            "name": "Savings",
            "account_type": "bank account",
            "opening_balance": "0.00",
            "billing_cycle_end": 25,
        },
        headers=headers,
    )
    wallet_response = client.post(
        "/users/setup/accounts",
        json={
            "name": "Wallet 2",
            "account_type": "wallet",
            "opening_balance": "0.00",
            "credit_limit": "1000.00",
        },
        headers=headers,
    )

    assert bank_response.status_code == 422
    assert wallet_response.status_code == 422


def test_credit_card_requires_credit_limit_and_expiration_date() -> None:
    client = make_test_client()
    token = register_user(client)

    response = client.post(
        "/users/setup/accounts",
        json={"name": "Incomplete Card", "account_type": "credit card", "opening_balance": "0.00"},
        headers=auth_headers(token),
    )

    assert response.status_code == 422


def test_changing_credit_card_to_wallet_clears_credit_card_fields() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    created = client.post(
        "/users/setup/accounts",
        json={
            "name": "HDFC Credit Card",
            "account_type": "credit card",
            "opening_balance": "2500.00",
            "expiration_date": "2028-12-31T00:00:00+00:00",
            "credit_limit": "100000.00",
            "billing_cycle_end": 25,
        },
        headers=headers,
    )
    assert created.status_code == 201

    updated = client.patch(
        f"/users/setup/accounts/{created.json()['id']}",
        json={"account_type": "wallet"},
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["account_type"] == "wallet"
    assert updated.json()["expiration_date"] is None
    assert updated.json()["credit_limit"] is None
    assert updated.json()["billing_cycle_end"] is None


def test_account_type_must_be_supported_value() -> None:
    client = make_test_client()
    token = register_user(client)

    response = client.post(
        "/users/setup/accounts",
        json={"name": "Brokerage", "account_type": "investment", "opening_balance": "0.00"},
        headers=auth_headers(token),
    )

    assert response.status_code == 422


def test_setup_default_opening_balances_updates_cash_and_pending_accounts() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    first_update = client.patch(
        "/users/setup/accounts/defaults/opening-balances",
        json={"cash_opening_balance": "1200.00", "pending_from_friends_opening_balance": "350.00"},
        headers=headers,
    )
    assert first_update.status_code == 200
    updated_names = sorted(item["name"] for item in first_update.json())
    assert updated_names == ["Cash", "Pending from Friends"]

    accounts_after_first_update = client.get("/users/setup/accounts", headers=headers)
    assert accounts_after_first_update.status_code == 200
    balances = {item["name"]: item["current_balance"] for item in accounts_after_first_update.json()}
    assert balances["Cash"] == "1200.00"
    assert balances["Pending from Friends"] == "350.00"

    second_update = client.patch(
        "/users/setup/accounts/defaults/opening-balances",
        json={"cash_opening_balance": "1500.00", "pending_from_friends_opening_balance": "100.00"},
        headers=headers,
    )
    assert second_update.status_code == 200

    accounts_after_second_update = client.get("/users/setup/accounts", headers=headers)
    assert accounts_after_second_update.status_code == 200
    second_balances = {item["name"]: item["current_balance"] for item in accounts_after_second_update.json()}
    assert second_balances["Cash"] == "1500.00"
    assert second_balances["Pending from Friends"] == "100.00"


def test_create_and_list_budgets_for_current_user() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    category = client.post(
        "/users/setup/categories",
        json={"kind": "expense", "name": "Food"},
        headers=headers,
    )
    assert category.status_code == 201

    created = client.post(
        "/users/setup/budgets",
        json={
            "name": "July Food Budget",
            "amount": "15000.00",
            "category_id": category.json()["id"],
            "start_date": "2026-07-01T00:00:00+00:00",
            "end_date": "2026-07-31T23:59:59+00:00",
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["name"] == "July Food Budget"
    assert created.json()["spent_amount"] == "0.00"
    assert created.json()["remaining_amount"] == "15000.00"

    listed = client.get("/users/setup/budgets", headers=headers)
    assert listed.status_code == 200
    assert [budget["name"] for budget in listed.json()] == ["July Food Budget"]


def test_budget_spent_amount_uses_expense_transactions_for_period_and_category() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    funded_account = client.post(
        "/users/setup/accounts",
        json={"name": "Budget Wallet", "account_type": "wallet", "opening_balance": "500.00"},
        headers=headers,
    )
    assert funded_account.status_code == 201
    account_id = funded_account.json()["id"]

    food_category = client.post(
        "/users/setup/categories",
        json={"kind": "expense", "name": "Food"},
        headers=headers,
    )
    transport_category = client.post(
        "/users/setup/categories",
        json={"kind": "expense", "name": "Transport"},
        headers=headers,
    )
    assert food_category.status_code == 201
    assert transport_category.status_code == 201

    budget = client.post(
        "/users/setup/budgets",
        json={
            "name": "Food July",
            "amount": "1000.00",
            "category_id": food_category.json()["id"],
            "start_date": "2026-07-01T00:00:00+00:00",
            "end_date": "2026-07-31T23:59:59+00:00",
        },
        headers=headers,
    )
    assert budget.status_code == 201

    july_food_expense = client.post(
        "/transactions",
        json={
            "date": "2026-07-10T10:00:00+00:00",
            "amount": "120.00",
            "account_id": account_id,
            "transaction_type": "EXPENSE",
            "category_id": food_category.json()["id"],
        },
        headers=headers,
    )
    july_transport_expense = client.post(
        "/transactions",
        json={
            "date": "2026-07-12T10:00:00+00:00",
            "amount": "50.00",
            "account_id": account_id,
            "transaction_type": "EXPENSE",
            "category_id": transport_category.json()["id"],
        },
        headers=headers,
    )
    june_food_expense = client.post(
        "/transactions",
        json={
            "date": "2026-06-28T10:00:00+00:00",
            "amount": "25.00",
            "account_id": account_id,
            "transaction_type": "EXPENSE",
            "category_id": food_category.json()["id"],
        },
        headers=headers,
    )
    assert july_food_expense.status_code == 200
    assert july_transport_expense.status_code == 200
    assert june_food_expense.status_code == 200

    budgets = client.get("/users/setup/budgets", headers=headers)
    assert budgets.status_code == 200
    first_budget = budgets.json()[0]
    assert first_budget["name"] == "Food July"
    assert first_budget["spent_amount"] == "120.00"
    assert first_budget["remaining_amount"] == "880.00"


def test_categories_and_tags_use_model_names_without_user_prefix() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    category = client.post(
        "/users/setup/categories",
        json={"kind": "expense", "name": "Food & Drinks"},
        headers=headers,
    )
    assert category.status_code == 201
    assert category.json()["kind"] == "expense"

    tag = client.post("/users/setup/tags", json={"name": "needs", "color": "#00aa88"}, headers=headers)
    assert tag.status_code == 201
    assert tag.json()["color"] == "#00aa88"

    expense_categories = client.get("/users/setup/categories", params={"kind": "expense"}, headers=headers)
    tags = client.get("/users/setup/tags", headers=headers)

    grouped_categories = expense_categories.json()
    assert [item["name"] for item in grouped_categories["expense"]] == ["Food & Drinks"]
    assert grouped_categories["income"] == []
    assert grouped_categories["transfer"] == []
    assert [item["name"] for item in tags.json()] == ["needs"]


def test_categories_are_grouped_by_kind() -> None:
    client = make_test_client()
    token = register_user(client)

    with Session(client.app.state.test_engine) as session:
        seed_global_categories(session)

    response = client.get("/users/setup/categories", headers=auth_headers(token))

    assert response.status_code == 200
    grouped = response.json()
    assert set(grouped) == {"income", "expense", "transfer", "investment", "refund"}
    assert [item["name"] for item in grouped["income"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "income"
    ]
    assert [item["name"] for item in grouped["expense"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "expense"
    ]
    assert [item["name"] for item in grouped["transfer"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "transfer"
    ]
    assert [item["name"] for item in grouped["investment"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "investment"
    ]
    assert [item["name"] for item in grouped["refund"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "refund"
    ]


def test_user_cannot_create_duplicate_category() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    payload = {"kind": "expense", "name": "Food & Drinks"}

    created = client.post("/users/setup/categories", json=payload, headers=headers)
    duplicate = client.post("/users/setup/categories", json=payload, headers=headers)

    assert created.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Category already exists"


def test_user_cannot_create_category_that_exists_globally() -> None:
    client = make_test_client()
    token = register_user(client)

    with Session(client.app.state.test_engine) as session:
        seed_global_categories(session)

    response = client.post(
        "/users/setup/categories",
        json={"kind": "expense", "name": "Food & Drinks"},
        headers=auth_headers(token),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Category already exists"


def test_seed_global_categories_uses_category_model() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(bind=engine)

    with Session(engine) as session:
        seed_global_categories(session)
        seed_global_categories(session)
        categories = session.exec(select(CategoryModel).where(CategoryModel.is_global == True)).all()

    assert len(categories) == len(DEFAULT_CATEGORIES)
    assert {category.kind for category in categories} == {"income", "expense", "transfer", "investment", "refund"}
    assert all(category.user_id is None for category in categories)


def test_create_and_list_goals_for_current_user() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    listed_before = client.get("/goals", headers=headers)
    assert listed_before.status_code == 200
    assert listed_before.json() == []

    templates = client.get("/goals/templates", headers=headers)
    assert templates.status_code == 200
    assert any(goal["name"] == "Emergency Fund" for goal in templates.json())

    created = client.post(
        "/users/setup/goals",
        json={"name": "New Camera Fund", "target_amount": "200000.00", "current_amount": "25000.00"},
        headers=headers,
    )
    listed = client.get("/users/setup/goals", headers=headers)

    assert created.status_code == 201
    assert created.json()["name"] == "New Camera Fund"
    assert created.json()["target_amount"] == "200000.00"
    assert listed.status_code == 200
    assert "New Camera Fund" in [goal["name"] for goal in listed.json()]
    assert "Emergency Fund" not in [goal["name"] for goal in listed.json()]


def test_update_goal_amount_and_target_date() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)

    created = client.post(
        "/goals",
        json={"name": "Laptop", "target_amount": "80000.00", "current_amount": "10000.00"},
        headers=headers,
    )
    assert created.status_code == 201
    goal_id = created.json()["id"]

    updated = client.patch(
        f"/goals/{goal_id}",
        json={"target_amount": "90000.00", "current_amount": "15000.00", "target_date": "2027-01-15T00:00:00Z"},
        headers=headers,
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["name"] == "Laptop"
    assert body["target_amount"] == "90000.00"
    assert body["current_amount"] == "15000.00"
    assert body["target_date"].startswith("2027-01-15")


def test_net_worth_includes_investments_and_history() -> None:
    from decimal import Decimal

    from ledgr.features.investments import service as investment_service

    client = make_test_client()
    token = register_user(client, email="networth@example.com")
    headers = auth_headers(token)

    stock = client.post(
        "/investments/stocks",
        json={
            "symbol": "INFY",
            "company_name": "Infosys",
            "quantity": "1.000",
            "avg_price": "100.000",
            "current_price": "120.000",
        },
        headers=headers,
    )
    assert stock.status_code == 201

    international = client.post(
        "/investments/international",
        json={
            "symbol": "AAPL",
            "security_name": "Apple",
            "instrument_type": "stock",
            "quantity": "1.000000",
            "avg_price": "150.000",
            "current_price": "200.000",
        },
        headers=headers,
    )
    assert international.status_code == 201

    original_fetch = investment_service.fetch_current_price

    def fake_fetch_current_price(*, symbol: str, exchange=None, market: str = "IN"):
        del exchange
        del market
        if symbol.upper() == "INR=X":
            return symbol, Decimal("85.000"), "USD/INR"
        return symbol, Decimal("1.000"), None

    investment_service.fetch_current_price = fake_fetch_current_price
    try:
        response = client.get("/users/net-worth?days=7", headers=headers)
    finally:
        investment_service.fetch_current_price = original_fetch

    assert response.status_code == 200
    body = response.json()
    assert body["stocks_value"] == "120.00"
    assert body["international_value"] == "17000.00"
    assert body["crypto_value"] == "0.00"
    assert body["other_investments_value"] == "0.00"
    assert body["net_worth"] == "17120.00"
    assert len(body["history"]) == 7
    assert body["history"][-1]["net_worth"] == "17120.00"


def test_net_worth_includes_crypto_holdings() -> None:
    from decimal import Decimal

    from ledgr.features.investments import service as investment_service

    client = make_test_client()
    token = register_user(client, email="crypto-networth@example.com")
    headers = auth_headers(token)

    created = client.post(
        "/investments/crypto",
        json={
            "symbol": "BTC",
            "asset_name": "Bitcoin",
            "quantity": "1.000000",
            "avg_price": "100.000",
            "current_price": "200.000",
        },
        headers=headers,
    )
    assert created.status_code == 201

    original_fetch = investment_service.fetch_current_price

    def fake_fetch_current_price(*, symbol: str, exchange=None, market: str = "IN"):
        del exchange
        del market
        if symbol.upper() == "INR=X":
            return symbol, Decimal("85.000"), "USD/INR"
        return symbol, Decimal("1.000"), None

    investment_service.fetch_current_price = fake_fetch_current_price
    try:
        response = client.get("/users/net-worth?days=7", headers=headers)
    finally:
        investment_service.fetch_current_price = original_fetch

    assert response.status_code == 200
    body = response.json()
    assert body["crypto_value"] == "17000.00"
    assert body["net_worth"] == "17000.00"


def test_net_worth_includes_epf_ppf_nps_holdings() -> None:
    client = make_test_client()
    token = register_user(client, email="epf-networth@example.com")
    headers = auth_headers(token)

    with Session(client.app.state.test_engine) as session:
        seed_global_categories(session)

    accounts = client.get("/users/setup/accounts", headers=headers).json()
    cash_account = next(account for account in accounts if account["name"] == "Cash")
    categories = client.get("/users/setup/categories", headers=headers).json()
    epf_category = next(
        category for category in categories["investment"] if category["name"] == "EPF/PPF/NPS"
    )

    created = client.post(
        "/transactions",
        json={
            "date": "2026-07-18T10:00:00+00:00",
            "amount": "50000.00",
            "account_id": cash_account["id"],
            "transaction_type": "INVESTMENT",
            "category_id": epf_category["id"],
            "merchant": "EPF",
        },
        headers=headers,
    )
    assert created.status_code == 200

    response = client.get("/users/net-worth?days=7", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["other_investments_value"] == "50000.00"
    assert body["accounts_value"] == "0.00"
    assert body["net_worth"] == "50000.00"


def test_goals_are_scoped_to_current_user() -> None:
    client = make_test_client()
    first_token = register_user(client, "first-goal@example.com")
    second_token = register_user(client, "second-goal@example.com")

    first_response = client.post(
        "/users/setup/goals",
        json={"name": "Home Upgrade", "target_amount": "1000000.00"},
        headers=auth_headers(first_token),
    )
    second_response = client.post(
        "/users/setup/goals",
        json={"name": "Bike", "target_amount": "100000.00"},
        headers=auth_headers(second_token),
    )
    first_list = client.get("/users/setup/goals", headers=auth_headers(first_token))
    second_list = client.get("/users/setup/goals", headers=auth_headers(second_token))

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert "Home Upgrade" in [goal["name"] for goal in first_list.json()]
    assert "Bike" in [goal["name"] for goal in second_list.json()]


def test_user_cannot_create_duplicate_goal_name() -> None:
    client = make_test_client()
    token = register_user(client)
    headers = auth_headers(token)
    payload = {"name": "Vacation", "target_amount": "50000.00"}

    first = client.post("/users/setup/goals", json=payload, headers=headers)
    duplicate = client.post("/users/setup/goals", json=payload, headers=headers)

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Goal already exists for this user"
