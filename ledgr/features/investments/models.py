from datetime import date as dt_date
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, Numeric
from sqlmodel import Field, SQLModel, String
from sqlalchemy import Date, UniqueConstraint

class MutualFundDataModel(SQLModel, table=True):
    __tablename__ = "mutual_fund_data"
    scheme_code: int = Field(nullable=False, primary_key=True, index=True)
    fund_house: str = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    scheme_type: str = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    scheme_category: str = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    scheme_name: str = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    isin_growth: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    isin_div_reinvestment: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True, index=True))
    date: dt_date = Field(default=None, sa_column=Column(Date, nullable=True, index=True))
    nav: Decimal = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True, index=True))