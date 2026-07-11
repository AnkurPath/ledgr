from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlmodel import Session, select

from ledgr.features.investments.service import (
    list_international_portfolio,
    list_mutual_fund_portfolio,
    list_stock_portfolio,
)
from ledgr.features.users.models import AccountModel, NetWorthModel

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES)


def _day_start(day: date) -> datetime:
    return datetime(day.year, day.month, day.day)


def compute_net_worth(*, session: Session, user_id: UUID) -> dict[str, Decimal]:
    accounts = session.exec(select(AccountModel).where(AccountModel.user_id == user_id)).all()
    accounts_value = _quantize(sum((account.current_balance for account in accounts), ZERO))

    mutual_funds_value = list_mutual_fund_portfolio(session=session, user_id=user_id).total_current_value
    stocks_value = list_stock_portfolio(session=session, user_id=user_id).total_current_value
    international_value = list_international_portfolio(session=session, user_id=user_id).total_current_value

    net_worth = _quantize(accounts_value + mutual_funds_value + stocks_value + international_value)
    return {
        "net_worth": net_worth,
        "accounts_value": accounts_value,
        "mutual_funds_value": mutual_funds_value,
        "stocks_value": stocks_value,
        "international_value": international_value,
    }


def upsert_today_net_worth(*, session: Session, user_id: UUID, net_worth: Decimal) -> NetWorthModel:
    today = date.today()
    day = _day_start(today)
    existing = session.exec(
        select(NetWorthModel).where(
            NetWorthModel.user_id == user_id,
            NetWorthModel.date == day,
        )
    ).first()

    if existing is None:
        existing = NetWorthModel(user_id=user_id, date=day, net_worth=net_worth)
    else:
        existing.net_worth = net_worth

    session.add(existing)
    session.commit()
    session.refresh(existing)
    return existing


def list_net_worth_history(
    *,
    session: Session,
    user_id: UUID,
    days: int = 30,
) -> list[dict[str, object]]:
    today = date.today()
    start_day = today - timedelta(days=max(days - 1, 0))
    start_dt = _day_start(start_day)

    rows = session.exec(
        select(NetWorthModel)
        .where(
            NetWorthModel.user_id == user_id,
            NetWorthModel.date >= start_dt,
        )
        .order_by(NetWorthModel.date.asc())
    ).all()

    by_day = {
        (row.date.date() if isinstance(row.date, datetime) else row.date): row.net_worth for row in rows
    }

    carry = ZERO
    prior = session.exec(
        select(NetWorthModel)
        .where(
            NetWorthModel.user_id == user_id,
            NetWorthModel.date < start_dt,
        )
        .order_by(NetWorthModel.date.desc())
    ).first()
    if prior is not None:
        carry = prior.net_worth

    history: list[dict[str, object]] = []
    for offset in range(days):
        day = start_day + timedelta(days=offset)
        if day in by_day:
            carry = by_day[day]
        history.append({"date": day.isoformat(), "net_worth": carry})

    return history


def get_net_worth_overview(*, session: Session, user_id: UUID, days: int = 30) -> dict:
    breakdown = compute_net_worth(session=session, user_id=user_id)
    upsert_today_net_worth(session=session, user_id=user_id, net_worth=breakdown["net_worth"])
    history = list_net_worth_history(session=session, user_id=user_id, days=days)
    return {
        **breakdown,
        "as_of": datetime.utcnow(),
        "history": history,
    }
