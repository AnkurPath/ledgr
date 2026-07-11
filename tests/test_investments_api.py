import os
from datetime import date as dt_date
from decimal import Decimal
from typing import Optional

os.environ["LEDGR_DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

import ledgr.models  # noqa: F401
from ledgr.app import app
from ledgr.core.db import get_session
from ledgr.features.investments.models import MutualFundDataModel
from ledgr.features.investments import service as investment_service
from ledgr.features.investments.service import quantize_three_places


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


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register_user(client: TestClient, email: str = "mf@example.com") -> str:
    response = client.post(
        "/users/register",
        json={
            "email": email,
            "password": "pass1234",
            "first_name": "MF",
            "last_name": "User",
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def seed_mutual_funds(client: TestClient) -> None:
    with Session(client.app.state.test_engine) as session:
        session.add(
            MutualFundDataModel(
                scheme_code=100001,
                scheme_name="Alpha Growth Fund",
                fund_house="Alpha AMC",
                date=dt_date(2026, 7, 4),
                nav=Decimal("110.000"),
            )
        )
        session.add(
            MutualFundDataModel(
                scheme_code=100002,
                scheme_name="Beta Balanced Fund",
                fund_house="Beta AMC",
                date=dt_date(2026, 7, 4),
                nav=Decimal("95.500"),
            )
        )
        session.commit()


def test_search_mutual_funds_returns_matching_schemes() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)

    response = client.get(
        "/investments/mutual-funds/search",
        params={"q": "alpha"},
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["scheme_code"] == 100001
    assert items[0]["scheme_name"] == "Alpha Growth Fund"


def test_add_mutual_fund_investment_quantizes_to_three_decimals() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)

    response = client.post(
        "/investments/mutual-funds",
        json={"scheme_code": 100001, "units": "10.1234", "avg_price": "98.7654"},
        headers=auth_headers(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["units"] == "10.123"
    assert body["avg_price"] == "98.765"


def test_add_mutual_fund_investment_updates_weighted_average() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)
    headers = auth_headers(token)

    first = client.post(
        "/investments/mutual-funds",
        json={"scheme_code": 100001, "units": "1.000", "avg_price": "100.000"},
        headers=headers,
    )
    second = client.post(
        "/investments/mutual-funds",
        json={"scheme_code": 100001, "units": "2.000", "avg_price": "110.000"},
        headers=headers,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["units"] == "3.000"
    assert second.json()["avg_price"] == "106.667"


def test_patch_mutual_fund_investment_sets_absolute_units_and_avg_price() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)
    headers = auth_headers(token)

    created = client.post(
        "/investments/mutual-funds",
        json={"scheme_code": 100001, "units": "1.000", "avg_price": "100.000"},
        headers=headers,
    )
    assert created.status_code == 201
    investment_id = created.json()["id"]

    updated = client.patch(
        f"/investments/mutual-funds/{investment_id}",
        json={"units": "5.500", "avg_price": "120.250"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["units"] == "5.500"
    assert updated.json()["avg_price"] == "120.250"

    portfolio = client.get("/investments/mutual-funds", headers=headers)
    assert portfolio.status_code == 200
    holding = portfolio.json()["holdings"][0]
    assert holding["units"] == "5.500"
    assert holding["avg_price"] == "120.250"


def test_list_mutual_fund_portfolio_returns_valuation_fields() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)
    headers = auth_headers(token)

    created = client.post(
        "/investments/mutual-funds",
        json={"scheme_code": 100001, "units": "2.000", "avg_price": "100.000"},
        headers=headers,
    )
    assert created.status_code == 201

    response = client.get("/investments/mutual-funds", headers=headers)
    assert response.status_code == 200
    body = response.json()

    assert body["total_invested_amount"] == "200.00"
    assert body["total_current_value"] == "220.00"
    assert body["total_pnl"] == "20.00"
    assert body["total_pnl_percent"] == "10.00"
    assert len(body["holdings"]) == 1
    assert body["holdings"][0]["scheme_name"] == "Alpha Growth Fund"


def test_quantize_three_places_rounds_half_up() -> None:
    assert quantize_three_places(Decimal("12.3454")) == Decimal("12.345")
    assert quantize_three_places(Decimal("12.3455")) == Decimal("12.346")


def test_mutual_fund_investment_can_be_tagged_with_goal() -> None:
    client = make_test_client()
    token = register_user(client)
    seed_mutual_funds(client)
    headers = auth_headers(token)

    goal_response = client.post(
        "/goals",
        json={"name": "Retirement", "target_amount": "5000000.00"},
        headers=headers,
    )
    assert goal_response.status_code == 201
    retirement_goal = goal_response.json()

    create_response = client.post(
        "/investments/mutual-funds",
        json={
            "scheme_code": 100001,
            "goal_id": retirement_goal["id"],
            "units": "2.000",
            "avg_price": "100.000",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    assert create_response.json()["goal_id"] == retirement_goal["id"]

    portfolio_response = client.get("/investments/mutual-funds", headers=headers)
    assert portfolio_response.status_code == 200
    portfolio = portfolio_response.json()
    assert portfolio["holdings"][0]["goal_id"] == retirement_goal["id"]
    assert portfolio["holdings"][0]["goal_name"] == "Retirement"


def test_add_stock_investment_and_list_portfolio() -> None:
    client = make_test_client()
    token = register_user(client, email="stocks@example.com")
    headers = auth_headers(token)

    goal_response = client.post(
        "/goals",
        json={"name": "Travel", "target_amount": "300000.00"},
        headers=headers,
    )
    assert goal_response.status_code == 201
    travel_goal = goal_response.json()

    create_response = client.post(
        "/investments/stocks",
        json={
            "symbol": "TCS",
            "company_name": "Tata Consultancy Services",
            "exchange": "NSE",
            "goal_id": travel_goal["id"],
            "quantity": "10.000",
            "avg_price": "1000.000",
            "current_price": "1100.000",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["symbol"] == "TCS"
    assert created["goal_id"] == travel_goal["id"]

    portfolio_response = client.get("/investments/stocks", headers=headers)
    assert portfolio_response.status_code == 200
    body = portfolio_response.json()
    assert body["total_invested_amount"] == "10000.00"
    assert body["total_current_value"] == "11000.00"
    assert body["total_pnl"] == "1000.00"
    assert body["holdings"][0]["goal_name"] == "Travel"


def test_add_stock_investment_auto_fetches_current_price_when_missing() -> None:
    client = make_test_client()
    token = register_user(client, email="stocks-auto@example.com")
    headers = auth_headers(token)

    original_fetch = investment_service.fetch_current_price

    def fake_fetch_current_price(*, symbol: str, exchange: Optional[str] = None, market: str = "IN"):
        del exchange
        del market
        return symbol, Decimal("245.750")

    investment_service.fetch_current_price = fake_fetch_current_price
    try:
        create_response = client.post(
            "/investments/stocks",
            json={
                "symbol": "TCS",
                "exchange": "NSE",
                "quantity": "2.000",
                "avg_price": "200.000",
            },
            headers=headers,
        )
    finally:
        investment_service.fetch_current_price = original_fetch

    assert create_response.status_code == 201
    assert create_response.json()["current_price"] == "245.750"


def test_add_international_investment_auto_fetches_current_price() -> None:
    client = make_test_client()
    token = register_user(client, email="intl-auto@example.com")
    headers = auth_headers(token)

    options_response = client.get("/investments/options", headers=headers)
    assert options_response.status_code == 200
    international_sector_id = options_response.json()["international_sectors"][0]["id"]

    original_fetch = investment_service.fetch_current_price

    def fake_fetch_current_price(*, symbol: str, exchange: Optional[str] = None, market: str = "IN"):
        del exchange
        del market
        return symbol, Decimal("5100.250")

    investment_service.fetch_current_price = fake_fetch_current_price
    try:
        create_response = client.post(
            "/investments/international",
            json={
                "symbol": "^GSPC",
                "instrument_type": "index",
                "sector_option_id": international_sector_id,
                "quantity": "1.000",
                "avg_price": "5000.000",
            },
            headers=headers,
        )
    finally:
        investment_service.fetch_current_price = original_fetch

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["symbol"] == "^GSPC"
    assert created["sector_option_id"] == international_sector_id
    assert created["current_price"] == "5100.250"


def test_investment_options_can_be_used_for_stock_and_mutual_fund() -> None:
    client = make_test_client()
    token = register_user(client, email="options@example.com")
    headers = auth_headers(token)
    seed_mutual_funds(client)

    options_response = client.get("/investments/options", headers=headers)
    assert options_response.status_code == 200
    options = options_response.json()
    assert len(options["stock_sectors"]) > 0
    assert len(options["mutual_fund_categories"]) > 0

    stock_sector_id = options["stock_sectors"][0]["id"]
    mf_category_id = options["mutual_fund_categories"][0]["id"]

    stock_create = client.post(
        "/investments/stocks",
        json={
            "symbol": "RELIANCE",
            "company_name": "Reliance Industries",
            "exchange": "NSE",
            "sector_option_id": stock_sector_id,
            "quantity": "5.000",
            "avg_price": "2500.000",
            "current_price": "2550.000",
        },
        headers=headers,
    )
    assert stock_create.status_code == 201
    assert stock_create.json()["sector_option_id"] == stock_sector_id

    mf_create = client.post(
        "/investments/mutual-funds",
        json={
            "scheme_code": 100001,
            "category_option_id": mf_category_id,
            "units": "3.000",
            "avg_price": "101.000",
        },
        headers=headers,
    )
    assert mf_create.status_code == 201
    assert mf_create.json()["category_option_id"] == mf_category_id

    stock_portfolio = client.get("/investments/stocks", headers=headers)
    assert stock_portfolio.status_code == 200
    assert stock_portfolio.json()["holdings"][0]["sector_option_id"] == stock_sector_id
    assert stock_portfolio.json()["holdings"][0]["sector_name"] is not None

    mf_portfolio = client.get("/investments/mutual-funds", headers=headers)
    assert mf_portfolio.status_code == 200
    assert mf_portfolio.json()["holdings"][0]["category_option_id"] == mf_category_id
    assert mf_portfolio.json()["holdings"][0]["category_name"] is not None
