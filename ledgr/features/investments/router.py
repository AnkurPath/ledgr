from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from uuid import UUID
from sqlmodel import Session

from ledgr.core.db import get_session
from ledgr.core.security import get_current_user
from ledgr.features.investments.models import MutualFundDataModel
from ledgr.features.users.models import GoalModel
from ledgr.features.users.models import UserModel
from ledgr.features.investments.schemas import (
    CurrentPriceResponse,
    InvestmentOptionCreate,
    InvestmentOptionResponse,
    InvestmentOptionsCatalogResponse,
    InternationalInvestmentPortfolioResponse,
    InternationalInvestmentUpdateRequest,
    InternationalInvestmentUpsertRequest,
    InternationalInvestmentUpsertResponse,
    MutualFundInvestmentPortfolioResponse,
    MutualFundInvestmentUpdateRequest,
    MutualFundInvestmentUpsertRequest,
    MutualFundInvestmentUpsertResponse,
    MutualFundSearchItem,
    StockInvestmentPortfolioResponse,
    StockInvestmentUpdateRequest,
    StockInvestmentUpsertRequest,
    StockInvestmentUpsertResponse,
)
from ledgr.features.investments.service import (
    MarketDataRateLimited,
    MarketDataUnavailable,
    create_investment_option,
    fetch_current_price,
    get_investment_option_by_id,
    list_international_portfolio,
    list_investment_options_catalog,
    list_mutual_fund_portfolio,
    list_stock_portfolio,
    search_mutual_funds,
    update_international_investment,
    update_mutual_fund_investment,
    update_stock_investment,
    upsert_international_investment,
    upsert_stock_investment,
    upsert_mutual_fund_investment,
)

router = APIRouter(prefix="/investments", tags=["investments"])


@router.get("/options", response_model=InvestmentOptionsCatalogResponse)
def list_investment_options(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> InvestmentOptionsCatalogResponse:
    del current_user
    return list_investment_options_catalog(session=session)


@router.post("/options", response_model=InvestmentOptionResponse, status_code=status.HTTP_201_CREATED)
def add_investment_option(
    payload: InvestmentOptionCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> InvestmentOptionResponse:
    del current_user
    try:
        option = create_investment_option(session=session, payload=payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return InvestmentOptionResponse.model_validate(option, from_attributes=True)


@router.get("/mutual-funds/search", response_model=list[MutualFundSearchItem])
def search_mutual_fund_schemes(
    q: str = Query(min_length=2),
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> list[MutualFundDataModel]:
    del current_user
    return search_mutual_funds(session=session, query=q, limit=limit)


@router.post(
    "/mutual-funds",
    response_model=MutualFundInvestmentUpsertResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_mutual_fund_investment(
    payload: MutualFundInvestmentUpsertRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> MutualFundInvestmentUpsertResponse:
    fund = session.get(MutualFundDataModel, payload.scheme_code)
    if fund is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mutual fund scheme not found")
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.category_option_id is not None:
        category = get_investment_option_by_id(
            session=session,
            option_id=payload.category_option_id,
            asset_type="mutual_fund",
            field_name="category",
        )
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mutual fund category not found")

    investment = upsert_mutual_fund_investment(
        session=session,
        user_id=current_user.id,
        payload=payload,
    )
    return MutualFundInvestmentUpsertResponse.model_validate(investment, from_attributes=True)


@router.get("/mutual-funds", response_model=MutualFundInvestmentPortfolioResponse)
def list_mutual_fund_investments(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> MutualFundInvestmentPortfolioResponse:
    return list_mutual_fund_portfolio(session=session, user_id=current_user.id)


@router.patch("/mutual-funds/{investment_id}", response_model=MutualFundInvestmentUpsertResponse)
def patch_mutual_fund_investment(
    investment_id: UUID,
    payload: MutualFundInvestmentUpdateRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> MutualFundInvestmentUpsertResponse:
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.category_option_id is not None:
        category = get_investment_option_by_id(
            session=session,
            option_id=payload.category_option_id,
            asset_type="mutual_fund",
            field_name="category",
        )
        if category is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mutual fund category not found")

    try:
        investment = update_mutual_fund_investment(
            session=session,
            user_id=current_user.id,
            investment_id=investment_id,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return MutualFundInvestmentUpsertResponse.model_validate(investment, from_attributes=True)


@router.post(
    "/stocks",
    response_model=StockInvestmentUpsertResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_stock_investment(
    payload: StockInvestmentUpsertRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> StockInvestmentUpsertResponse:
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.sector_option_id is not None:
        sector = get_investment_option_by_id(
            session=session,
            option_id=payload.sector_option_id,
            asset_type="stock",
            field_name="sector",
        )
        if sector is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock sector not found")

    investment = upsert_stock_investment(
        session=session,
        user_id=current_user.id,
        payload=payload,
    )
    return StockInvestmentUpsertResponse.model_validate(investment, from_attributes=True)


@router.get("/stocks", response_model=StockInvestmentPortfolioResponse)
def list_stock_investments(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> StockInvestmentPortfolioResponse:
    return list_stock_portfolio(session=session, user_id=current_user.id)


@router.patch("/stocks/{investment_id}", response_model=StockInvestmentUpsertResponse)
def patch_stock_investment(
    investment_id: UUID,
    payload: StockInvestmentUpdateRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> StockInvestmentUpsertResponse:
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.sector_option_id is not None:
        sector = get_investment_option_by_id(
            session=session,
            option_id=payload.sector_option_id,
            asset_type="stock",
            field_name="sector",
        )
        if sector is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock sector not found")

    try:
        investment = update_stock_investment(
            session=session,
            user_id=current_user.id,
            investment_id=investment_id,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return StockInvestmentUpsertResponse.model_validate(investment, from_attributes=True)


@router.get("/stocks/current-price", response_model=CurrentPriceResponse)
def get_stock_current_price(
    symbol: str = Query(min_length=1, max_length=25),
    exchange: Optional[str] = Query(default=None, max_length=25),
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> CurrentPriceResponse:
    del session
    del current_user
    try:
        market_symbol, current_price, name = fetch_current_price(symbol=symbol, exchange=exchange, market="IN")
    except MarketDataRateLimited as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except (MarketDataUnavailable, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return CurrentPriceResponse(
        symbol=symbol.upper(),
        market_symbol=market_symbol,
        current_price=current_price,
        name=name,
    )


@router.get("/international/current-price", response_model=CurrentPriceResponse)
def get_international_current_price(
    symbol: str = Query(min_length=1, max_length=25),
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> CurrentPriceResponse:
    del session
    del current_user
    try:
        market_symbol, current_price, name = fetch_current_price(symbol=symbol, market="US")
    except MarketDataRateLimited as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except (MarketDataUnavailable, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return CurrentPriceResponse(
        symbol=symbol.upper(),
        market_symbol=market_symbol,
        current_price=current_price,
        name=name,
    )


@router.post(
    "/international",
    response_model=InternationalInvestmentUpsertResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_international_investment(
    payload: InternationalInvestmentUpsertRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> InternationalInvestmentUpsertResponse:
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.sector_option_id is not None:
        sector = get_investment_option_by_id(
            session=session,
            option_id=payload.sector_option_id,
            asset_type="international",
            field_name="sector",
        )
        if sector is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="International sector not found")

    investment = upsert_international_investment(
        session=session,
        user_id=current_user.id,
        payload=payload,
    )
    return InternationalInvestmentUpsertResponse.model_validate(investment, from_attributes=True)


@router.get("/international", response_model=InternationalInvestmentPortfolioResponse)
def list_international_investments(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> InternationalInvestmentPortfolioResponse:
    return list_international_portfolio(session=session, user_id=current_user.id)


@router.patch("/international/{investment_id}", response_model=InternationalInvestmentUpsertResponse)
def patch_international_investment(
    investment_id: UUID,
    payload: InternationalInvestmentUpdateRequest,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user),
) -> InternationalInvestmentUpsertResponse:
    if payload.goal_id is not None:
        goal = session.get(GoalModel, payload.goal_id)
        if goal is None or goal.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    if payload.sector_option_id is not None:
        sector = get_investment_option_by_id(
            session=session,
            option_id=payload.sector_option_id,
            asset_type="international",
            field_name="sector",
        )
        if sector is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="International sector not found")

    try:
        investment = update_international_investment(
            session=session,
            user_id=current_user.id,
            investment_id=investment_id,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return InternationalInvestmentUpsertResponse.model_validate(investment, from_attributes=True)
