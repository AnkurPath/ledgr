from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MutualFundSearchItem(BaseModel):
    scheme_code: int
    scheme_name: str
    fund_house: Optional[str] = None
    nav: Optional[Decimal] = None
    date: Optional[dt_date] = None


class MutualFundInvestmentUpsertRequest(BaseModel):
    scheme_code: int
    goal_id: Optional[UUID] = None
    category_option_id: Optional[UUID] = None
    units: Decimal = Field(gt=0)
    avg_price: Decimal = Field(gt=0)


class MutualFundInvestmentUpsertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    scheme_code: int
    goal_id: Optional[UUID] = None
    category_option_id: Optional[UUID] = None
    units: Decimal
    avg_price: Decimal
    created_at: datetime
    updated_at: datetime


class MutualFundInvestmentHolding(BaseModel):
    id: UUID
    scheme_code: int
    goal_id: Optional[UUID] = None
    goal_name: Optional[str] = None
    category_option_id: Optional[UUID] = None
    category_name: Optional[str] = None
    scheme_name: str
    fund_house: Optional[str] = None
    units: Decimal
    avg_price: Decimal
    nav: Optional[Decimal] = None
    nav_date: Optional[dt_date] = None
    invested_amount: Decimal
    current_value: Decimal
    pnl: Decimal
    pnl_percent: Decimal


class MutualFundInvestmentPortfolioResponse(BaseModel):
    holdings: list[MutualFundInvestmentHolding]
    total_invested_amount: Decimal
    total_current_value: Decimal
    total_pnl: Decimal
    total_pnl_percent: Decimal


class StockInvestmentUpsertRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=25)
    company_name: Optional[str] = Field(default=None, max_length=250)
    exchange: Optional[str] = Field(default=None, max_length=25)
    goal_id: Optional[UUID] = None
    sector_option_id: Optional[UUID] = None
    quantity: Decimal = Field(gt=0)
    avg_price: Decimal = Field(gt=0)
    current_price: Optional[Decimal] = Field(default=None, gt=0)


class StockInvestmentUpsertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    goal_id: Optional[UUID] = None
    sector_option_id: Optional[UUID] = None
    symbol: str
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    created_at: datetime
    updated_at: datetime


class StockInvestmentHolding(BaseModel):
    id: UUID
    symbol: str
    company_name: Optional[str] = None
    exchange: Optional[str] = None
    goal_id: Optional[UUID] = None
    goal_name: Optional[str] = None
    sector_option_id: Optional[UUID] = None
    sector_name: Optional[str] = None
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    invested_amount: Decimal
    current_value: Decimal
    pnl: Decimal
    pnl_percent: Decimal


class StockInvestmentPortfolioResponse(BaseModel):
    holdings: list[StockInvestmentHolding]
    total_invested_amount: Decimal
    total_current_value: Decimal
    total_pnl: Decimal
    total_pnl_percent: Decimal


class InternationalInvestmentUpsertRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=25)
    security_name: Optional[str] = Field(default=None, max_length=250)
    market: str = Field(default="US", max_length=25)
    instrument_type: str = Field(default="stock", max_length=25)
    goal_id: Optional[UUID] = None
    sector_option_id: Optional[UUID] = None
    quantity: Decimal = Field(gt=0)
    avg_price: Decimal = Field(gt=0)
    current_price: Optional[Decimal] = Field(default=None, gt=0)


class InternationalInvestmentUpsertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    goal_id: Optional[UUID] = None
    sector_option_id: Optional[UUID] = None
    symbol: str
    security_name: Optional[str] = None
    market: str
    instrument_type: str
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    created_at: datetime
    updated_at: datetime


class InternationalInvestmentHolding(BaseModel):
    id: UUID
    symbol: str
    security_name: Optional[str] = None
    market: str
    instrument_type: str
    goal_id: Optional[UUID] = None
    goal_name: Optional[str] = None
    sector_option_id: Optional[UUID] = None
    sector_name: Optional[str] = None
    quantity: Decimal
    avg_price: Decimal
    current_price: Decimal
    invested_amount: Decimal
    current_value: Decimal
    pnl: Decimal
    pnl_percent: Decimal


class InternationalInvestmentPortfolioResponse(BaseModel):
    holdings: list[InternationalInvestmentHolding]
    total_invested_amount: Decimal
    total_current_value: Decimal
    total_pnl: Decimal
    total_pnl_percent: Decimal


class CurrentPriceResponse(BaseModel):
    symbol: str
    market_symbol: str
    current_price: Decimal


class InvestmentOptionCreate(BaseModel):
    asset_type: str = Field(min_length=1, max_length=40)
    field_name: str = Field(min_length=1, max_length=40)
    display_name: str = Field(min_length=1, max_length=120)
    sort_order: int = 0


class InvestmentOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_type: str
    field_name: str
    display_name: str
    sort_order: int
    is_active: bool


class InvestmentOptionsCatalogResponse(BaseModel):
    stock_sectors: list[InvestmentOptionResponse]
    international_sectors: list[InvestmentOptionResponse]
    mutual_fund_categories: list[InvestmentOptionResponse]
