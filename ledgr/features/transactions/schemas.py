from enum import Enum
from decimal import Decimal
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

class TransactionTypeEnum(str, Enum):
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"
    TRANSFER = "TRANSFER"
    INVESTMENT = "INVESTMENT"
    REFUND = "REFUND"

class TransactionCreate(BaseModel):
    date: datetime
    merchant: Optional[str] = None
    product: Optional[str] = None
    amount: Decimal = Field(gt=0)
    account_id: Optional[int] = None
    source_account_id: Optional[int] = None
    destination_account_id: Optional[int] = None
    transaction_type: TransactionTypeEnum
    category_id: Optional[int] = None
    tag_id: Optional[int] = None
    goal_id: Optional[int] = None   
    notes: Optional[str] = None
    bills: Optional[str] = None

    @model_validator(mode="after")
    def validate_accounts_for_transaction_type(self) -> "TransactionCreate":
        if self.transaction_type == TransactionTypeEnum.TRANSFER:
            has_transfer_accounts = self.source_account_id is not None or self.destination_account_id is not None
            if has_transfer_accounts and (self.source_account_id is None or self.destination_account_id is None):
                raise ValueError("source_account_id and destination_account_id must be provided together")
            if self.account_id is None and not has_transfer_accounts:
                raise ValueError("account_id or source_account_id and destination_account_id are required for transfers")
            return self

        if self.account_id is None:
            raise ValueError("account_id is required for this transaction type")
        return self

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    date: datetime
    merchant: Optional[str] = None
    product: Optional[str] = None
    amount: Decimal
    account_id: int
    transaction_type: TransactionTypeEnum
    category_id: Optional[int] = None
    tag_id: Optional[int] = None
    goal_id: Optional[int] = None   
    notes: Optional[str] = None
    bills: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TransactionCreateResponse(BaseModel):
    message: str
    transactions: list[TransactionResponse]
    amount_transferred: Optional[Decimal] = None
