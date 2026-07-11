from decimal import Decimal, ROUND_HALF_UP
import json
from typing import Optional
import urllib.parse
import urllib.request
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import ProgrammingError
from sqlmodel import Session, select

from ledgr.features.investments.models import (
    InvestmentOptionModel,
    InternationalInvestmentModel,
    MutualFundDataModel,
    MutualFundInvestmentModel,
    StockInvestmentModel,
)
from ledgr.features.investments.schemas import (
    InvestmentOptionCreate,
    InvestmentOptionResponse,
    InvestmentOptionsCatalogResponse,
    InternationalInvestmentHolding,
    InternationalInvestmentPortfolioResponse,
    InternationalInvestmentUpsertRequest,
    MutualFundInvestmentHolding,
    MutualFundInvestmentPortfolioResponse,
    MutualFundInvestmentUpsertRequest,
    StockInvestmentHolding,
    StockInvestmentPortfolioResponse,
    StockInvestmentUpsertRequest,
)
from ledgr.features.users.models import GoalModel

THREE_DECIMAL_PLACES = Decimal("0.001")
TWO_DECIMAL_PLACES = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO = Decimal("0")
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
DEFAULT_STOCK_SECTORS = (
    "Financials",
    "IT",
    "Oil & Gas",
    "FMCG",
    "Automobiles",
    "Healthcare",
    "Metals",
    "Consumption",
    "Chemicals",
    "Reality",
    "Other",
)
DEFAULT_INTERNATIONAL_SECTORS = (
    "Technology",
    "Financials",
    "Healthcare",
    "Consumer Discretionary",
    "Communication Services",
    "Industrials",
    "Energy",
    "Utilities",
    "Materials",
    "Real Estate",
    "Index",
    "Other",
)
DEFAULT_MUTUAL_FUND_CATEGORIES = (
    "Large Cap",
    "Mid Cap",
    "Small Cap",
    "Multi Cap",
    "Flexi Cap",
    "Index Fund",
    "Debt Fund",
    "Hybrid Fund",
    "ELSS",
    "International Fund",
    "Other",
)


def quantize_three_places(value: Decimal) -> Decimal:
    return value.quantize(THREE_DECIMAL_PLACES, rounding=ROUND_HALF_UP)


def quantize_two_places(value: Decimal) -> Decimal:
    return value.quantize(TWO_DECIMAL_PLACES, rounding=ROUND_HALF_UP)


def _is_missing_international_table_error(exc: ProgrammingError) -> bool:
    message = str(exc).lower()
    return "international_investments" in message and "does not exist" in message


def _empty_international_portfolio_response() -> InternationalInvestmentPortfolioResponse:
    return InternationalInvestmentPortfolioResponse(
        holdings=[],
        total_invested_amount=ZERO,
        total_current_value=ZERO,
        total_pnl=ZERO,
        total_pnl_percent=ZERO,
    )


def _normalize_dimension(value: str) -> str:
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    if normalized.endswith("s"):
        normalized = normalized[:-1]
    return normalized


def ensure_default_investment_options(session: Session) -> None:
    defaults: tuple[tuple[str, str, tuple[str, ...]], ...] = (
        ("stock", "sector", DEFAULT_STOCK_SECTORS),
        ("international", "sector", DEFAULT_INTERNATIONAL_SECTORS),
        ("mutual_fund", "category", DEFAULT_MUTUAL_FUND_CATEGORIES),
    )
    created_any = False
    for asset_type, field_name, values in defaults:
        existing = set(
            session.exec(
                select(InvestmentOptionModel.display_name).where(
                    InvestmentOptionModel.asset_type == asset_type,
                    InvestmentOptionModel.field_name == field_name,
                )
            ).all()
        )
        for index, display_name in enumerate(values):
            if display_name in existing:
                continue
            session.add(
                InvestmentOptionModel(
                    asset_type=asset_type,
                    field_name=field_name,
                    display_name=display_name,
                    sort_order=index,
                )
            )
            created_any = True
    if created_any:
        session.commit()


def list_investment_options_catalog(session: Session) -> InvestmentOptionsCatalogResponse:
    ensure_default_investment_options(session)
    options = session.exec(
        select(InvestmentOptionModel)
        .where(InvestmentOptionModel.is_active == True)
        .order_by(
            InvestmentOptionModel.asset_type.asc(),
            InvestmentOptionModel.field_name.asc(),
            InvestmentOptionModel.sort_order.asc(),
            InvestmentOptionModel.display_name.asc(),
        )
    ).all()

    stock_sectors: list[InvestmentOptionResponse] = []
    international_sectors: list[InvestmentOptionResponse] = []
    mutual_fund_categories: list[InvestmentOptionResponse] = []
    for option in options:
        if option.asset_type == "stock" and option.field_name == "sector":
            stock_sectors.append(InvestmentOptionResponse.model_validate(option, from_attributes=True))
        elif option.asset_type == "international" and option.field_name == "sector":
            international_sectors.append(InvestmentOptionResponse.model_validate(option, from_attributes=True))
        elif option.asset_type == "mutual_fund" and option.field_name == "category":
            mutual_fund_categories.append(InvestmentOptionResponse.model_validate(option, from_attributes=True))

    return InvestmentOptionsCatalogResponse(
        stock_sectors=stock_sectors,
        international_sectors=international_sectors,
        mutual_fund_categories=mutual_fund_categories,
    )


def create_investment_option(*, session: Session, payload: InvestmentOptionCreate) -> InvestmentOptionModel:
    asset_type = payload.asset_type.strip().lower().replace("-", "_").replace(" ", "_")
    field_name = _normalize_dimension(payload.field_name)
    if asset_type not in {"stock", "mutual_fund", "international"}:
        raise ValueError("Unsupported asset_type. Use 'stock', 'mutual_fund', or 'international'.")
    if field_name not in {"sector", "category"}:
        raise ValueError("Unsupported field_name. Use 'sector' or 'category'.")

    option = InvestmentOptionModel(
        asset_type=asset_type,
        field_name=field_name,
        display_name=payload.display_name.strip(),
        sort_order=payload.sort_order,
    )
    session.add(option)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ValueError("Option already exists for this asset and field.")
    session.refresh(option)
    return option


def get_investment_option_by_id(
    *,
    session: Session,
    option_id: UUID,
    asset_type: Optional[str] = None,
    field_name: Optional[str] = None,
) -> Optional[InvestmentOptionModel]:
    option = session.get(InvestmentOptionModel, option_id)
    if option is None:
        return None
    if asset_type and option.asset_type != asset_type:
        return None
    if field_name and option.field_name != field_name:
        return None
    if not option.is_active:
        return None
    return option


def _resolve_market_symbol(*, symbol: str, exchange: Optional[str] = None, market: str = "IN") -> str:
    raw_symbol = symbol.strip().upper()
    if market.upper() == "US":
        return raw_symbol

    normalized_exchange = (exchange or "").strip().upper()
    if normalized_exchange == "NSE" and not raw_symbol.endswith(".NS"):
        return f"{raw_symbol}.NS"
    if normalized_exchange == "BSE" and not raw_symbol.endswith(".BO"):
        return f"{raw_symbol}.BO"
    return raw_symbol


def fetch_current_price(*, symbol: str, exchange: Optional[str] = None, market: str = "IN") -> tuple[str, Decimal]:
    market_symbol = _resolve_market_symbol(symbol=symbol, exchange=exchange, market=market)
    query = urllib.parse.urlencode({"symbols": market_symbol})
    url = f"{YAHOO_QUOTE_URL}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "ledgr/0.1"})
    with urllib.request.urlopen(request, timeout=10) as response:
        payload = json.loads(response.read().decode("utf-8"))

    items = payload.get("quoteResponse", {}).get("result", [])
    if not items:
        raise ValueError("Unable to fetch current price for symbol")

    price_value = items[0].get("regularMarketPrice")
    if price_value is None:
        raise ValueError("Current market price unavailable for symbol")

    return market_symbol, quantize_three_places(Decimal(str(price_value)))


def upsert_mutual_fund_investment(
    *,
    session: Session,
    user_id: UUID,
    payload: MutualFundInvestmentUpsertRequest,
) -> MutualFundInvestmentModel:
    units = quantize_three_places(payload.units)
    avg_price = quantize_three_places(payload.avg_price)

    existing = session.exec(
        select(MutualFundInvestmentModel).where(
            MutualFundInvestmentModel.user_id == user_id,
            MutualFundInvestmentModel.scheme_code == payload.scheme_code,
        )
    ).first()

    if existing is None:
        investment = MutualFundInvestmentModel(
            user_id=user_id,
            scheme_code=payload.scheme_code,
            goal_id=payload.goal_id,
            category_option_id=payload.category_option_id,
            units=units,
            avg_price=avg_price,
        )
        session.add(investment)
        session.commit()
        session.refresh(investment)
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
        return investment

    previous_goal_id = existing.goal_id
    total_units = quantize_three_places(existing.units + units)
    total_cost = (existing.units * existing.avg_price) + (units * avg_price)
    existing.units = total_units
    existing.avg_price = quantize_three_places(total_cost / total_units)
    existing.goal_id = payload.goal_id
    existing.category_option_id = payload.category_option_id
    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
    if previous_goal_id is not None and previous_goal_id != existing.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return existing


def list_mutual_fund_portfolio(
    *,
    session: Session,
    user_id: UUID,
) -> MutualFundInvestmentPortfolioResponse:
    statement = (
        select(MutualFundInvestmentModel, MutualFundDataModel, GoalModel, InvestmentOptionModel)
        .join(MutualFundDataModel, MutualFundDataModel.scheme_code == MutualFundInvestmentModel.scheme_code)
        .outerjoin(GoalModel, GoalModel.id == MutualFundInvestmentModel.goal_id)
        .outerjoin(InvestmentOptionModel, InvestmentOptionModel.id == MutualFundInvestmentModel.category_option_id)
        .where(MutualFundInvestmentModel.user_id == user_id)
        .order_by(MutualFundInvestmentModel.created_at.desc())
    )
    rows = session.exec(statement).all()

    holdings: list[MutualFundInvestmentHolding] = []
    total_invested = ZERO
    total_current = ZERO

    for investment, fund_data, goal, category_option in rows:
        invested_amount = quantize_two_places(investment.units * investment.avg_price)
        nav = fund_data.nav or ZERO
        current_value = quantize_two_places(investment.units * nav)
        pnl = quantize_two_places(current_value - invested_amount)
        pnl_percent = ZERO
        if invested_amount > ZERO:
            pnl_percent = quantize_two_places((pnl / invested_amount) * HUNDRED)

        holdings.append(
            MutualFundInvestmentHolding(
                id=investment.id,
                scheme_code=investment.scheme_code,
                goal_id=investment.goal_id,
                goal_name=goal.name if goal else None,
                category_option_id=investment.category_option_id,
                category_name=category_option.display_name if category_option else None,
                scheme_name=fund_data.scheme_name,
                fund_house=fund_data.fund_house,
                units=investment.units,
                avg_price=investment.avg_price,
                nav=fund_data.nav,
                nav_date=fund_data.date,
                invested_amount=invested_amount,
                current_value=current_value,
                pnl=pnl,
                pnl_percent=pnl_percent,
            )
        )
        total_invested += invested_amount
        total_current += current_value

    total_invested = quantize_two_places(total_invested)
    total_current = quantize_two_places(total_current)
    total_pnl = quantize_two_places(total_current - total_invested)
    total_pnl_percent = ZERO
    if total_invested > ZERO:
        total_pnl_percent = quantize_two_places((total_pnl / total_invested) * HUNDRED)

    return MutualFundInvestmentPortfolioResponse(
        holdings=holdings,
        total_invested_amount=total_invested,
        total_current_value=total_current,
        total_pnl=total_pnl,
        total_pnl_percent=total_pnl_percent,
    )


def search_mutual_funds(*, session: Session, query: str, limit: int) -> list[MutualFundDataModel]:
    like_query = f"%{query.strip().lower()}%"
    statement = (
        select(MutualFundDataModel)
        .where(func.lower(MutualFundDataModel.scheme_name).like(like_query))
        .order_by(MutualFundDataModel.scheme_name.asc())
        .limit(limit)
    )
    return list(session.exec(statement).all())


def upsert_stock_investment(
    *,
    session: Session,
    user_id: UUID,
    payload: StockInvestmentUpsertRequest,
) -> StockInvestmentModel:
    symbol = payload.symbol.strip().upper()
    quantity = quantize_three_places(payload.quantity)
    avg_price = quantize_three_places(payload.avg_price)
    company_name = payload.company_name.strip() if payload.company_name else None
    exchange = payload.exchange.strip().upper() if payload.exchange else None
    if payload.current_price is None:
        _, current_price = fetch_current_price(symbol=symbol, exchange=exchange, market="IN")
    else:
        current_price = quantize_three_places(payload.current_price)

    existing = session.exec(
        select(StockInvestmentModel).where(
            StockInvestmentModel.user_id == user_id,
            StockInvestmentModel.symbol == symbol,
        )
    ).first()

    if existing is None:
        investment = StockInvestmentModel(
            user_id=user_id,
            goal_id=payload.goal_id,
            sector_option_id=payload.sector_option_id,
            symbol=symbol,
            company_name=company_name,
            exchange=exchange,
            quantity=quantity,
            avg_price=avg_price,
            current_price=current_price,
        )
        session.add(investment)
        session.commit()
        session.refresh(investment)
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
        return investment

    previous_goal_id = existing.goal_id
    total_quantity = quantize_three_places(existing.quantity + quantity)
    total_cost = (existing.quantity * existing.avg_price) + (quantity * avg_price)
    existing.quantity = total_quantity
    existing.avg_price = quantize_three_places(total_cost / total_quantity)
    existing.current_price = current_price
    existing.goal_id = payload.goal_id
    existing.sector_option_id = payload.sector_option_id
    if company_name:
        existing.company_name = company_name
    if exchange:
        existing.exchange = exchange

    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
    if previous_goal_id is not None and previous_goal_id != existing.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return existing


def upsert_international_investment(
    *,
    session: Session,
    user_id: UUID,
    payload: InternationalInvestmentUpsertRequest,
) -> InternationalInvestmentModel:
    symbol = payload.symbol.strip().upper()
    quantity = quantize_three_places(payload.quantity)
    avg_price = quantize_three_places(payload.avg_price)
    security_name = payload.security_name.strip() if payload.security_name else None
    market = payload.market.strip().upper() if payload.market else "US"
    instrument_type = payload.instrument_type.strip().lower() if payload.instrument_type else "stock"

    if payload.current_price is None:
        _, current_price = fetch_current_price(symbol=symbol, market=market)
    else:
        current_price = quantize_three_places(payload.current_price)

    existing = session.exec(
        select(InternationalInvestmentModel).where(
            InternationalInvestmentModel.user_id == user_id,
            InternationalInvestmentModel.symbol == symbol,
        )
    ).first()

    if existing is None:
        investment = InternationalInvestmentModel(
            user_id=user_id,
            goal_id=payload.goal_id,
            sector_option_id=payload.sector_option_id,
            symbol=symbol,
            security_name=security_name,
            market=market,
            instrument_type=instrument_type,
            quantity=quantity,
            avg_price=avg_price,
            current_price=current_price,
        )
        session.add(investment)
        session.commit()
        session.refresh(investment)
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
        return investment

    previous_goal_id = existing.goal_id
    total_quantity = quantize_three_places(existing.quantity + quantity)
    total_cost = (existing.quantity * existing.avg_price) + (quantity * avg_price)
    existing.quantity = total_quantity
    existing.avg_price = quantize_three_places(total_cost / total_quantity)
    existing.current_price = current_price
    existing.goal_id = payload.goal_id
    existing.sector_option_id = payload.sector_option_id
    existing.market = market
    existing.instrument_type = instrument_type
    if security_name:
        existing.security_name = security_name

    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
    if previous_goal_id is not None and previous_goal_id != existing.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return existing


def list_stock_portfolio(
    *,
    session: Session,
    user_id: UUID,
) -> StockInvestmentPortfolioResponse:
    statement = (
        select(StockInvestmentModel, GoalModel, InvestmentOptionModel)
        .outerjoin(GoalModel, GoalModel.id == StockInvestmentModel.goal_id)
        .outerjoin(InvestmentOptionModel, InvestmentOptionModel.id == StockInvestmentModel.sector_option_id)
        .where(StockInvestmentModel.user_id == user_id)
        .order_by(StockInvestmentModel.created_at.desc())
    )
    rows = session.exec(statement).all()

    holdings: list[StockInvestmentHolding] = []
    total_invested = ZERO
    total_current = ZERO

    for investment, goal, sector_option in rows:
        invested_amount = quantize_two_places(investment.quantity * investment.avg_price)
        current_value = quantize_two_places(investment.quantity * investment.current_price)
        pnl = quantize_two_places(current_value - invested_amount)
        pnl_percent = ZERO
        if invested_amount > ZERO:
            pnl_percent = quantize_two_places((pnl / invested_amount) * HUNDRED)

        holdings.append(
            StockInvestmentHolding(
                id=investment.id,
                symbol=investment.symbol,
                company_name=investment.company_name,
                exchange=investment.exchange,
                goal_id=investment.goal_id,
                goal_name=goal.name if goal else None,
                sector_option_id=investment.sector_option_id,
                sector_name=sector_option.display_name if sector_option else None,
                quantity=investment.quantity,
                avg_price=investment.avg_price,
                current_price=investment.current_price,
                invested_amount=invested_amount,
                current_value=current_value,
                pnl=pnl,
                pnl_percent=pnl_percent,
            )
        )
        total_invested += invested_amount
        total_current += current_value

    total_invested = quantize_two_places(total_invested)
    total_current = quantize_two_places(total_current)
    total_pnl = quantize_two_places(total_current - total_invested)
    total_pnl_percent = ZERO
    if total_invested > ZERO:
        total_pnl_percent = quantize_two_places((total_pnl / total_invested) * HUNDRED)

    return StockInvestmentPortfolioResponse(
        holdings=holdings,
        total_invested_amount=total_invested,
        total_current_value=total_current,
        total_pnl=total_pnl,
        total_pnl_percent=total_pnl_percent,
    )


def list_international_portfolio(
    *,
    session: Session,
    user_id: UUID,
) -> InternationalInvestmentPortfolioResponse:
    statement = (
        select(InternationalInvestmentModel, GoalModel, InvestmentOptionModel)
        .outerjoin(GoalModel, GoalModel.id == InternationalInvestmentModel.goal_id)
        .outerjoin(InvestmentOptionModel, InvestmentOptionModel.id == InternationalInvestmentModel.sector_option_id)
        .where(InternationalInvestmentModel.user_id == user_id)
        .order_by(InternationalInvestmentModel.created_at.desc())
    )
    try:
        rows = session.exec(statement).all()
    except ProgrammingError as exc:
        # Older databases may not yet have international investment tables.
        # Return an empty portfolio so dashboard refresh does not fail hard.
        if _is_missing_international_table_error(exc):
            session.rollback()
            return _empty_international_portfolio_response()
        raise

    holdings: list[InternationalInvestmentHolding] = []
    total_invested = ZERO
    total_current = ZERO

    for investment, goal, sector_option in rows:
        invested_amount = quantize_two_places(investment.quantity * investment.avg_price)
        current_value = quantize_two_places(investment.quantity * investment.current_price)
        pnl = quantize_two_places(current_value - invested_amount)
        pnl_percent = ZERO
        if invested_amount > ZERO:
            pnl_percent = quantize_two_places((pnl / invested_amount) * HUNDRED)

        holdings.append(
            InternationalInvestmentHolding(
                id=investment.id,
                symbol=investment.symbol,
                security_name=investment.security_name,
                market=investment.market,
                instrument_type=investment.instrument_type,
                goal_id=investment.goal_id,
                goal_name=goal.name if goal else None,
                sector_option_id=investment.sector_option_id,
                sector_name=sector_option.display_name if sector_option else None,
                quantity=investment.quantity,
                avg_price=investment.avg_price,
                current_price=investment.current_price,
                invested_amount=invested_amount,
                current_value=current_value,
                pnl=pnl,
                pnl_percent=pnl_percent,
            )
        )
        total_invested += invested_amount
        total_current += current_value

    total_invested = quantize_two_places(total_invested)
    total_current = quantize_two_places(total_current)
    total_pnl = quantize_two_places(total_current - total_invested)
    total_pnl_percent = ZERO
    if total_invested > ZERO:
        total_pnl_percent = quantize_two_places((total_pnl / total_invested) * HUNDRED)

    return InternationalInvestmentPortfolioResponse(
        holdings=holdings,
        total_invested_amount=total_invested,
        total_current_value=total_current,
        total_pnl=total_pnl,
        total_pnl_percent=total_pnl_percent,
    )


def recalculate_goal_current_amount(*, session: Session, user_id: UUID, goal_id: Optional[UUID]) -> None:
    if goal_id is None:
        return

    goal = session.exec(
        select(GoalModel).where(
            GoalModel.id == goal_id,
            GoalModel.user_id == user_id,
        )
    ).first()
    if goal is None:
        return

    mf_statement = (
        select(MutualFundInvestmentModel, MutualFundDataModel)
        .join(MutualFundDataModel, MutualFundDataModel.scheme_code == MutualFundInvestmentModel.scheme_code)
        .where(
            MutualFundInvestmentModel.user_id == user_id,
            MutualFundInvestmentModel.goal_id == goal_id,
        )
    )
    mf_rows = session.exec(mf_statement).all()
    mf_total = ZERO
    for investment, fund_data in mf_rows:
        mf_total += quantize_two_places(investment.units * (fund_data.nav or ZERO))

    stock_statement = select(StockInvestmentModel).where(
        StockInvestmentModel.user_id == user_id,
        StockInvestmentModel.goal_id == goal_id,
    )
    stock_rows = session.exec(stock_statement).all()
    stock_total = ZERO
    for stock in stock_rows:
        stock_total += quantize_two_places(stock.quantity * stock.current_price)

    international_statement = select(InternationalInvestmentModel).where(
        InternationalInvestmentModel.user_id == user_id,
        InternationalInvestmentModel.goal_id == goal_id,
    )
    try:
        international_rows = session.exec(international_statement).all()
    except ProgrammingError as exc:
        if _is_missing_international_table_error(exc):
            session.rollback()
            international_rows = []
        else:
            raise
    international_total = ZERO
    for investment in international_rows:
        international_total += quantize_two_places(investment.quantity * investment.current_price)

    goal.current_amount = quantize_two_places(mf_total + stock_total + international_total)
    session.add(goal)
    session.commit()
