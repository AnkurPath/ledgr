from datetime import date as dt_date
from decimal import Decimal, ROUND_HALF_UP
import http.cookiejar
import json
import time
from typing import Optional
import urllib.error
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
    InvestmentPriceRefreshResponse,
    InvestmentOptionCreate,
    InvestmentOptionResponse,
    InvestmentOptionsCatalogResponse,
    InternationalInvestmentHolding,
    InternationalInvestmentPortfolioResponse,
    InternationalInvestmentUpdateRequest,
    InternationalInvestmentUpsertRequest,
    MutualFundInvestmentHolding,
    MutualFundInvestmentPortfolioResponse,
    MutualFundInvestmentUpdateRequest,
    MutualFundInvestmentUpsertRequest,
    StockInvestmentHolding,
    StockInvestmentPortfolioResponse,
    StockInvestmentUpdateRequest,
    StockInvestmentUpsertRequest,
)
from ledgr.features.users.models import GoalModel
from ledgr.utils.mfdata import refresh_mutual_fund_nav

THREE_DECIMAL_PLACES = Decimal("0.001")
SIX_DECIMAL_PLACES = Decimal("0.000001")
TWO_DECIMAL_PLACES = Decimal("0.01")
HUNDRED = Decimal("100")
ZERO = Decimal("0")
YAHOO_HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")
YAHOO_COOKIE_URL = "https://fc.yahoo.com"
YAHOO_USER_AGENT = "Mozilla/5.0"
YAHOO_RETRY_SECONDS = 1.5
PRICE_CACHE_TTL_SECONDS = 90

_yahoo_cookie_jar = http.cookiejar.CookieJar()
_yahoo_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_yahoo_cookie_jar))
_yahoo_crumb: Optional[str] = None
_price_cache: dict[str, tuple[float, Decimal, Optional[str]]] = {}


class MarketDataUnavailable(ValueError):
    """Raised when a quote cannot be resolved for a symbol."""


class MarketDataRateLimited(MarketDataUnavailable):
    """Raised when the upstream market data provider is rate limiting."""


DEFAULT_STOCK_SECTORS = (
    "Financials",
    "IT",
    "Oil & Gas",
    "Gold",
    "FMCG",
    "Automobiles",
    "Healthcare",
    "Metals",
    "Consumption",
    "Chemicals",
    "Reality",
    "Index",
    "International Fund",
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
    "Gold",
    "Index",
    "Other",
)
DEFAULT_MUTUAL_FUND_CATEGORIES = (
    "Large Cap",
    "Mid Cap",
    "Small Cap",
    "Multi Cap",
    "Flexi Cap",
    "Gold",
    "Index Fund",
    "Debt Fund",
    "Hybrid Fund",
    "ELSS",
    "International Fund",
    "Other",
)


def quantize_three_places(value: Decimal) -> Decimal:
    return value.quantize(THREE_DECIMAL_PLACES, rounding=ROUND_HALF_UP)


def quantize_six_places(value: Decimal) -> Decimal:
    return value.quantize(SIX_DECIMAL_PLACES, rounding=ROUND_HALF_UP)


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

    if raw_symbol.endswith((".NS", ".BO")):
        return raw_symbol

    normalized_exchange = (exchange or "").strip().upper()
    if normalized_exchange == "BSE":
        return f"{raw_symbol}.BO"
    # Default Indian listings to NSE when exchange is omitted.
    return f"{raw_symbol}.NS"


def _yahoo_request(url: str, *, retry_on_rate_limit: bool = True, use_session: bool = True) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": YAHOO_USER_AGENT,
            "Accept": "application/json,text/plain,*/*",
        },
    )
    open_url = _yahoo_opener.open if use_session else urllib.request.urlopen
    try:
        with open_url(request, timeout=10) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if retry_on_rate_limit and exc.code == 429:
            time.sleep(YAHOO_RETRY_SECONDS)
            with open_url(request, timeout=10) as response:
                return response.read()
        raise


def _refresh_yahoo_auth(*, host: str = YAHOO_HOSTS[0]) -> str:
    global _yahoo_crumb
    try:
        _yahoo_request(YAHOO_COOKIE_URL, retry_on_rate_limit=False)
    except urllib.error.HTTPError:
        # fc.yahoo.com often returns 404 while still setting the session cookie.
        pass

    crumb = _yahoo_request(f"https://{host}/v1/test/getcrumb", retry_on_rate_limit=False).decode("utf-8").strip()
    if not crumb or "too many requests" in crumb.lower():
        raise MarketDataRateLimited("Market data provider is rate limiting requests. Try again shortly.")
    _yahoo_crumb = crumb
    return crumb


def _display_name_from_fields(*candidates: object) -> Optional[str]:
    for candidate in candidates:
        if isinstance(candidate, str):
            cleaned = candidate.strip()
            if cleaned:
                return cleaned
    return None


def _price_and_name_from_quote_payload(payload: dict) -> tuple[Decimal, Optional[str]]:
    items = payload.get("quoteResponse", {}).get("result", [])
    if not items:
        raise MarketDataUnavailable("Unable to fetch current price for symbol")

    item = items[0]
    price_value = item.get("regularMarketPrice")
    if price_value is None:
        raise MarketDataUnavailable("Current market price unavailable for symbol")
    name = _display_name_from_fields(item.get("longName"), item.get("shortName"), item.get("displayName"))
    return Decimal(str(price_value)), name


def _price_and_name_from_chart_payload(payload: dict) -> tuple[Decimal, Optional[str]]:
    chart = payload.get("chart") or {}
    error = chart.get("error")
    if error:
        raise MarketDataUnavailable("Unable to fetch current price for symbol")

    results = chart.get("result") or []
    if not results:
        raise MarketDataUnavailable("Unable to fetch current price for symbol")

    meta = results[0].get("meta") or {}
    price_value = meta.get("regularMarketPrice")
    if price_value is None:
        price_value = meta.get("previousClose")
    if price_value is None:
        raise MarketDataUnavailable("Current market price unavailable for symbol")
    name = _display_name_from_fields(meta.get("longName"), meta.get("shortName"))
    return Decimal(str(price_value)), name


def _fetch_price_via_chart(market_symbol: str) -> tuple[Decimal, Optional[str]]:
    encoded_symbol = urllib.parse.quote(market_symbol)
    saw_rate_limit = False
    last_error: Optional[BaseException] = None
    for index, host in enumerate(YAHOO_HOSTS):
        url = f"https://{host}/v8/finance/chart/{encoded_symbol}?interval=1d&range=5d"
        try:
            payload = json.loads(
                _yahoo_request(
                    url,
                    retry_on_rate_limit=(index == 0),
                    use_session=False,
                ).decode("utf-8")
            )
            return _price_and_name_from_chart_payload(payload)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                saw_rate_limit = True
                continue
            if exc.code in (401, 403, 404):
                continue
            raise
        except (urllib.error.URLError, MarketDataUnavailable, json.JSONDecodeError) as exc:
            last_error = exc
            continue

    if saw_rate_limit:
        raise MarketDataRateLimited(
            "Market data provider is rate limiting requests. Try again shortly."
        ) from last_error
    raise MarketDataUnavailable("Unable to fetch current price for symbol") from last_error


def _fetch_price_via_quote(market_symbol: str) -> tuple[Decimal, Optional[str]]:
    global _yahoo_crumb
    host = YAHOO_HOSTS[0]
    crumb = _yahoo_crumb or _refresh_yahoo_auth(host=host)
    query = urllib.parse.urlencode({"symbols": market_symbol, "crumb": crumb})
    url = f"https://{host}/v7/finance/quote?{query}"
    try:
        payload = json.loads(_yahoo_request(url, retry_on_rate_limit=False).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise MarketDataRateLimited(
                "Market data provider is rate limiting requests. Try again shortly."
            ) from exc
        if exc.code not in (401, 403):
            raise
        crumb = _refresh_yahoo_auth(host=host)
        query = urllib.parse.urlencode({"symbols": market_symbol, "crumb": crumb})
        url = f"https://{host}/v7/finance/quote?{query}"
        payload = json.loads(_yahoo_request(url, retry_on_rate_limit=False).decode("utf-8"))
    return _price_and_name_from_quote_payload(payload)


def fetch_current_price(
    *, symbol: str, exchange: Optional[str] = None, market: str = "IN"
) -> tuple[str, Decimal, Optional[str]]:
    market_symbol = _resolve_market_symbol(symbol=symbol, exchange=exchange, market=market)
    cache_key = f"{market.upper()}:{market_symbol}"
    cached = _price_cache.get(cache_key)
    if cached is not None:
        cached_at, cached_price, cached_name = cached
        if time.time() - cached_at <= PRICE_CACHE_TTL_SECONDS:
            return market_symbol, cached_price, cached_name

    try:
        # Chart endpoint usually works without a crumb and is less rate-limited.
        try:
            price_value, name = _fetch_price_via_chart(market_symbol)
        except MarketDataRateLimited:
            raise
        except MarketDataUnavailable:
            price_value, name = _fetch_price_via_quote(market_symbol)
    except MarketDataRateLimited:
        raise
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        if isinstance(exc, urllib.error.HTTPError) and exc.code == 429:
            raise MarketDataRateLimited(
                "Market data provider is rate limiting requests. Try again shortly."
            ) from exc
        raise MarketDataUnavailable("Unable to fetch current price for symbol") from exc

    quantized = quantize_three_places(price_value)
    _price_cache[cache_key] = (time.time(), quantized, name)
    return market_symbol, quantized, name


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
            MutualFundInvestmentModel.goal_id == payload.goal_id,
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

    total_units = quantize_three_places(existing.units + units)
    total_cost = (existing.units * existing.avg_price) + (units * avg_price)
    existing.units = total_units
    existing.avg_price = quantize_three_places(total_cost / total_units)
    existing.category_option_id = payload.category_option_id
    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
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
        _, current_price, fetched_name = fetch_current_price(symbol=symbol, exchange=exchange, market="IN")
        if not company_name and fetched_name:
            company_name = fetched_name
    else:
        current_price = quantize_three_places(payload.current_price)

    existing = session.exec(
        select(StockInvestmentModel).where(
            StockInvestmentModel.user_id == user_id,
            StockInvestmentModel.symbol == symbol,
            StockInvestmentModel.goal_id == payload.goal_id,
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

    total_quantity = quantize_three_places(existing.quantity + quantity)
    total_cost = (existing.quantity * existing.avg_price) + (quantity * avg_price)
    existing.quantity = total_quantity
    existing.avg_price = quantize_three_places(total_cost / total_quantity)
    existing.current_price = current_price
    existing.sector_option_id = payload.sector_option_id
    if company_name:
        existing.company_name = company_name
    if exchange:
        existing.exchange = exchange

    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
    return existing


def upsert_international_investment(
    *,
    session: Session,
    user_id: UUID,
    payload: InternationalInvestmentUpsertRequest,
) -> InternationalInvestmentModel:
    symbol = payload.symbol.strip().upper()
    quantity = quantize_six_places(payload.quantity)
    avg_price = quantize_three_places(payload.avg_price)
    security_name = payload.security_name.strip() if payload.security_name else None
    market = payload.market.strip().upper() if payload.market else "US"
    instrument_type = payload.instrument_type.strip().lower() if payload.instrument_type else "stock"

    if payload.current_price is None:
        _, current_price, fetched_name = fetch_current_price(symbol=symbol, market=market)
        if not security_name and fetched_name:
            security_name = fetched_name
    else:
        current_price = quantize_three_places(payload.current_price)

    existing = session.exec(
        select(InternationalInvestmentModel).where(
            InternationalInvestmentModel.user_id == user_id,
            InternationalInvestmentModel.symbol == symbol,
            InternationalInvestmentModel.goal_id == payload.goal_id,
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

    total_quantity = quantize_six_places(existing.quantity + quantity)
    total_cost = (existing.quantity * existing.avg_price) + (quantity * avg_price)
    existing.quantity = total_quantity
    existing.avg_price = quantize_three_places(total_cost / total_quantity)
    existing.current_price = current_price
    existing.sector_option_id = payload.sector_option_id
    existing.market = market
    existing.instrument_type = instrument_type
    if security_name:
        existing.security_name = security_name

    session.add(existing)
    session.commit()
    session.refresh(existing)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=existing.goal_id)
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


def refresh_investment_prices_for_user(*, session: Session, user_id: UUID) -> InvestmentPriceRefreshResponse:
    latest_nav_date = (
        session.exec(select(MutualFundDataModel.date).order_by(MutualFundDataModel.date.desc()).limit(1)).first()
    )
    should_refresh_nav = latest_nav_date is None or latest_nav_date < dt_date.today()
    nav_stats = {
        "fetched": 0,
        "updated": 0,
        "inserted": 0,
        "skipped": 0,
        "failed": 0,
    }
    if should_refresh_nav:
        nav_stats = refresh_mutual_fund_nav(session)

    stocks_total = 0
    stocks_updated = 0
    stocks_failed = 0
    international_total = 0
    international_updated = 0
    international_failed = 0
    goal_ids_to_recalculate: set[UUID] = set()

    stock_holdings = session.exec(select(StockInvestmentModel).where(StockInvestmentModel.user_id == user_id)).all()
    stocks_total = len(stock_holdings)
    for investment in stock_holdings:
        try:
            _, current_price, fetched_name = fetch_current_price(
                symbol=investment.symbol,
                exchange=investment.exchange,
                market="IN",
            )
        except MarketDataUnavailable:
            stocks_failed += 1
            continue

        changed = False
        normalized_price = quantize_three_places(current_price)
        if investment.current_price != normalized_price:
            investment.current_price = normalized_price
            changed = True
        if fetched_name and fetched_name.strip() and fetched_name.strip() != (investment.company_name or "").strip():
            investment.company_name = fetched_name.strip()
            changed = True
        if changed:
            session.add(investment)
            stocks_updated += 1
            if investment.goal_id is not None:
                goal_ids_to_recalculate.add(investment.goal_id)

    try:
        international_holdings = session.exec(
            select(InternationalInvestmentModel).where(InternationalInvestmentModel.user_id == user_id)
        ).all()
    except ProgrammingError as exc:
        if _is_missing_international_table_error(exc):
            session.rollback()
            international_holdings = []
        else:
            raise
    international_total = len(international_holdings)
    for investment in international_holdings:
        try:
            _, current_price, fetched_name = fetch_current_price(
                symbol=investment.symbol,
                market=investment.market,
            )
        except MarketDataUnavailable:
            international_failed += 1
            continue

        changed = False
        normalized_price = quantize_three_places(current_price)
        if investment.current_price != normalized_price:
            investment.current_price = normalized_price
            changed = True
        if fetched_name and fetched_name.strip() and fetched_name.strip() != (investment.security_name or "").strip():
            investment.security_name = fetched_name.strip()
            changed = True
        if changed:
            session.add(investment)
            international_updated += 1
            if investment.goal_id is not None:
                goal_ids_to_recalculate.add(investment.goal_id)

    if should_refresh_nav:
        mf_goal_ids = session.exec(
            select(MutualFundInvestmentModel.goal_id).where(MutualFundInvestmentModel.user_id == user_id)
        ).all()
        for goal_id in mf_goal_ids:
            if goal_id is not None:
                goal_ids_to_recalculate.add(goal_id)

    if stocks_updated > 0 or international_updated > 0:
        session.commit()

    for goal_id in goal_ids_to_recalculate:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=goal_id)

    latest_nav_date = session.exec(select(func.max(MutualFundDataModel.date))).one()

    return InvestmentPriceRefreshResponse(
        nav_refreshed=should_refresh_nav,
        latest_nav_date=latest_nav_date,
        nav_fetched=nav_stats["fetched"],
        nav_updated=nav_stats["updated"],
        nav_inserted=nav_stats["inserted"],
        nav_skipped=nav_stats["skipped"],
        nav_failed=nav_stats["failed"],
        stocks_total=stocks_total,
        stocks_updated=stocks_updated,
        stocks_failed=stocks_failed,
        international_total=international_total,
        international_updated=international_updated,
        international_failed=international_failed,
    )


def update_mutual_fund_investment(
    *,
    session: Session,
    user_id: UUID,
    investment_id: UUID,
    payload: MutualFundInvestmentUpdateRequest,
) -> MutualFundInvestmentModel:
    investment = session.get(MutualFundInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("Mutual fund investment not found")

    previous_goal_id = investment.goal_id
    investment.units = quantize_three_places(payload.units)
    investment.avg_price = quantize_three_places(payload.avg_price)
    if "goal_id" in payload.model_fields_set:
        investment.goal_id = payload.goal_id
    if "category_option_id" in payload.model_fields_set:
        investment.category_option_id = payload.category_option_id

    session.add(investment)
    session.commit()
    session.refresh(investment)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
    if previous_goal_id is not None and previous_goal_id != investment.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return investment


def delete_mutual_fund_investment(*, session: Session, user_id: UUID, investment_id: UUID) -> None:
    investment = session.get(MutualFundInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("Mutual fund investment not found")

    goal_id = investment.goal_id
    session.delete(investment)
    session.commit()
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=goal_id)


def update_stock_investment(
    *,
    session: Session,
    user_id: UUID,
    investment_id: UUID,
    payload: StockInvestmentUpdateRequest,
) -> StockInvestmentModel:
    investment = session.get(StockInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("Stock investment not found")

    previous_goal_id = investment.goal_id
    investment.quantity = quantize_three_places(payload.quantity)
    investment.avg_price = quantize_three_places(payload.avg_price)
    if payload.current_price is not None:
        investment.current_price = quantize_three_places(payload.current_price)
    if "goal_id" in payload.model_fields_set:
        investment.goal_id = payload.goal_id
    if "sector_option_id" in payload.model_fields_set:
        investment.sector_option_id = payload.sector_option_id

    session.add(investment)
    session.commit()
    session.refresh(investment)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
    if previous_goal_id is not None and previous_goal_id != investment.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return investment


def delete_stock_investment(*, session: Session, user_id: UUID, investment_id: UUID) -> None:
    investment = session.get(StockInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("Stock investment not found")

    goal_id = investment.goal_id
    session.delete(investment)
    session.commit()
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=goal_id)


def update_international_investment(
    *,
    session: Session,
    user_id: UUID,
    investment_id: UUID,
    payload: InternationalInvestmentUpdateRequest,
) -> InternationalInvestmentModel:
    investment = session.get(InternationalInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("International investment not found")

    previous_goal_id = investment.goal_id
    investment.quantity = quantize_six_places(payload.quantity)
    investment.avg_price = quantize_three_places(payload.avg_price)
    if payload.current_price is not None:
        investment.current_price = quantize_three_places(payload.current_price)
    if "goal_id" in payload.model_fields_set:
        investment.goal_id = payload.goal_id
    if "sector_option_id" in payload.model_fields_set:
        investment.sector_option_id = payload.sector_option_id

    session.add(investment)
    session.commit()
    session.refresh(investment)
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=investment.goal_id)
    if previous_goal_id is not None and previous_goal_id != investment.goal_id:
        recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=previous_goal_id)
    return investment


def delete_international_investment(*, session: Session, user_id: UUID, investment_id: UUID) -> None:
    investment = session.get(InternationalInvestmentModel, investment_id)
    if investment is None or investment.user_id != user_id:
        raise LookupError("International investment not found")

    goal_id = investment.goal_id
    session.delete(investment)
    session.commit()
    recalculate_goal_current_amount(session=session, user_id=user_id, goal_id=goal_id)


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
