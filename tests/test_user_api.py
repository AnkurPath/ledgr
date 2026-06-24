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


def create_user(client: TestClient, username: str) -> dict:
    response = client.post("/users", json={"username": username, "display_name": username.title()})
    assert response.status_code == 201
    return response.json()


def test_user_registration() -> None:
    client = make_test_client()
    user = create_user(client, "ankur")

    accounts = client.get(f"/users/{user['id']}/setup/accounts")
    assert accounts.status_code == 200
    assert accounts.json() == []

    categories = client.get(f"/users/{user['id']}/setup/categories")
    assert categories.status_code == 200
    assert categories.json() == []

    tags = client.get(f"/users/{user['id']}/setup/tags")
    assert tags.status_code == 200
    assert tags.json() == []

    removed_default_route = client.post("/user/setup/defaults")
    assert removed_default_route.status_code == 404


def test_setup_data_is_scoped_to_user() -> None:
    client = make_test_client()
    ankur = create_user(client, "ankur")
    anmol = create_user(client, "anmol")

    account = client.post(
        f"/users/{ankur['id']}/setup/accounts",
        json={
            "name": "Savings Account",
            "account_type": "Bank",
            "opening_balance": "1500.50",
        },
    )
    assert account.status_code == 201
    account_id = account.json()["id"]

    same_account_name_for_other_user = client.post(
        f"/users/{anmol['id']}/setup/setup/accounts",
        json={"name": "Savings Account", "account_type": "Bank"},
    )
    # Note: Wait, the original commented path says `/users/{anmol['id']}/setup/accounts`
    # Let's fix the typo in the original commented-out code where it said `/setup/setup/` or make it match our endpoint `/users/{user_id}/setup/accounts`
    same_account_name_for_other_user = client.post(
        f"/users/{anmol['id']}/setup/accounts",
        json={"name": "Savings Account", "account_type": "Bank"},
    )
    assert same_account_name_for_other_user.status_code == 201

    duplicate_for_same_user = client.post(
        f"/users/{ankur['id']}/setup/accounts",
        json={"name": "Savings Account"},
    )
    assert duplicate_for_same_user.status_code == 409

    ankur_accounts = client.get(f"/users/{ankur['id']}/setup/accounts")
    assert ankur_accounts.status_code == 200
    assert [item["name"] for item in ankur_accounts.json()] == ["Savings Account"]

    anmol_accounts = client.get(f"/users/{anmol['id']}/setup/accounts")
    assert anmol_accounts.status_code == 200
    assert [item["name"] for item in anmol_accounts.json()] == ["Savings Account"]
    assert anmol_accounts.json()[0]["id"] != account_id

    cross_user_update = client.patch(
        f"/users/{anmol['id']}/setup/accounts/{account_id}",
        json={"name": "Should Not Update"},
    )
    assert cross_user_update.status_code == 404


def test_user_scoped_categories_and_tags() -> None:
    client = make_test_client()
    user = create_user(client, "ankur")

    category = client.post(
        f"/users/{user['id']}/setup/categories",
        json={"kind": "expense", "name": "Food & Drinks"},
    )
    assert category.status_code == 201
    assert category.json()["user_id"] == user["id"]

    tag = client.post(f"/users/{user['id']}/setup/tags", json={"name": "needs"})
    assert tag.status_code == 201
    assert tag.json()["user_id"] == user["id"]

    expense_categories = client.get(f"/users/{user['id']}/setup/categories", params={"kind": "expense"})
    assert expense_categories.status_code == 200
    assert [item["name"] for item in expense_categories.json()] == ["Food & Drinks"]

    tags = client.get(f"/users/{user['id']}/setup/tags")
    assert tags.status_code == 200
    assert [item["name"] for item in tags.json()] == ["needs"]
