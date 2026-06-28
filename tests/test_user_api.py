import os

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"

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

    assert profile.status_code == 200
    assert profile.json()["email"] == "ankur@example.com"
    assert profile.json()["display_name"] == "Ankur Test"


def test_setup_resources_are_scoped_to_current_user() -> None:
    client = make_test_client()
    first_token = register_user(client, "first@example.com")
    second_token = register_user(client, "second@example.com")

    first_account = client.post(
        "/users/setup/accounts",
        json={"name": "Savings", "account_type": "Bank", "opening_balance": "1500.50"},
        headers=auth_headers(first_token),
    )
    assert first_account.status_code == 201

    second_account = client.post(
        "/users/setup/accounts",
        json={"name": "Savings", "account_type": "Bank", "opening_balance": "100.00"},
        headers=auth_headers(second_token),
    )
    assert second_account.status_code == 201

    duplicate = client.post(
        "/users/setup/accounts",
        json={"name": "Savings"},
        headers=auth_headers(first_token),
    )
    assert duplicate.status_code == 409

    first_accounts = client.get("/users/setup/accounts", headers=auth_headers(first_token))
    second_accounts = client.get("/users/setup/accounts", headers=auth_headers(second_token))

    assert [item["name"] for item in first_accounts.json()] == ["Savings"]
    assert [item["name"] for item in second_accounts.json()] == ["Savings"]
    assert first_accounts.json()[0]["id"] != second_accounts.json()[0]["id"]


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
    assert set(grouped) == {"income", "expense", "transfer"}
    assert [item["name"] for item in grouped["income"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "income"
    ]
    assert [item["name"] for item in grouped["expense"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "expense"
    ]
    assert [item["name"] for item in grouped["transfer"]] == [
        item["name"] for item in DEFAULT_CATEGORIES if item["category"] == "transfer"
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
    assert {category.kind for category in categories} == {"income", "expense", "transfer"}
    assert all(category.user_id is None for category in categories)
