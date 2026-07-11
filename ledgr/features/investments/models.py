from datetime import date as dt_date
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, Numeric, UniqueConstraint, func
from sqlmodel import Field, SQLModel, String


class InvestmentOptionModel(SQLModel, table=True):
    __tablename__ = "investment_options"
    __table_args__ = (
        UniqueConstraint("asset_type", "field_name", "display_name", name="uq_investment_options_asset_field_display_name"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    asset_type: str = Field(sa_column=Column(String(40), nullable=False, index=True))
    field_name: str = Field(sa_column=Column(String(40), nullable=False, index=True))
    display_name: str = Field(sa_column=Column(String(120), nullable=False, index=True))
    sort_order: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class MutualFundDataModel(SQLModel, table=True):
    __tablename__ = "mutual_fund_data"

    scheme_code: int = Field(nullable=False, primary_key=True, index=True)
    fund_house: Optional[str] = Field(default=None, sa_column=Column(String(250), nullable=True, index=True))
    scheme_type: Optional[str] = Field(default=None, sa_column=Column(String(250), nullable=True, index=True))
    scheme_category: Optional[str] = Field(default=None, sa_column=Column(String(250), nullable=True, index=True))
    scheme_name: str = Field(sa_column=Column(String(500), nullable=False, index=True))
    isin_growth: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True))
    isin_div_reinvestment: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    date: Optional[dt_date] = Field(default=None, sa_column=Column(Date, nullable=True, index=True))
    nav: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 4), nullable=True, index=True))


class MutualFundInvestmentModel(SQLModel, table=True):
    __tablename__ = "mutual_fund_investments"
    __table_args__ = (
        UniqueConstraint("user_id", "scheme_code", name="uq_mutual_fund_investments_user_scheme_code"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    scheme_code: int = Field(foreign_key="mutual_fund_data.scheme_code", index=True, nullable=False)
    goal_id: Optional[UUID] = Field(default=None, foreign_key="goals.id", index=True, nullable=True)
    category_option_id: Optional[UUID] = Field(default=None, foreign_key="investment_options.id", index=True, nullable=True)
    units: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    avg_price: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class StockInvestmentModel(SQLModel, table=True):
    __tablename__ = "stock_investments"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_stock_investments_user_symbol"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    goal_id: Optional[UUID] = Field(default=None, foreign_key="goals.id", index=True, nullable=True)
    sector_option_id: Optional[UUID] = Field(default=None, foreign_key="investment_options.id", index=True, nullable=True)
    symbol: str = Field(sa_column=Column(String(25), nullable=False, index=True))
    company_name: Optional[str] = Field(default=None, sa_column=Column(String(250), nullable=True, index=True))
    exchange: Optional[str] = Field(default=None, sa_column=Column(String(25), nullable=True, index=True))
    quantity: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    avg_price: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    current_price: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )


class InternationalInvestmentModel(SQLModel, table=True):
    __tablename__ = "international_investments"
    __table_args__ = (
        UniqueConstraint("user_id", "symbol", name="uq_international_investments_user_symbol"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True, index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True, nullable=False)
    goal_id: Optional[UUID] = Field(default=None, foreign_key="goals.id", index=True, nullable=True)
    sector_option_id: Optional[UUID] = Field(default=None, foreign_key="investment_options.id", index=True, nullable=True)
    symbol: str = Field(sa_column=Column(String(25), nullable=False, index=True))
    security_name: Optional[str] = Field(default=None, sa_column=Column(String(250), nullable=True, index=True))
    market: str = Field(default="US", sa_column=Column(String(25), nullable=False, index=True))
    instrument_type: str = Field(default="stock", sa_column=Column(String(25), nullable=False, index=True))
    quantity: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    avg_price: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    current_price: Decimal = Field(sa_column=Column(Numeric(14, 3), nullable=False, index=True))
    created_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now()),
    )
    updated_at: datetime = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()),
    )

