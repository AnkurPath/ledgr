from datetime import timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ledgr.core.db import get_session
from ledgr.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_password_hash, verify_password, get_current_user
from ledgr.features.users.models import AccountModel, BudgetModel, CategoryModel, GoalModel, TagModel, UserModel
from ledgr.features.transactions.models import TransactionModel
from ledgr.features.users.schemas import (
    Token,
    UserRegister,
    UserProfile,
    AccountCreate, AccountResponse, AccountTypeEnum, AccountUpdate,
    DefaultAccountsOpeningBalanceSetup,
    CategoryCreate, CategoryGroupsResponse, CategoryResponse,
    GoalCreate, GoalResponse,
    BudgetCreate, BudgetResponse,
    TagCreate, TagResponse
)


router = APIRouter(prefix="/users", tags=["users"])

DEFAULT_ACCOUNT_NAMES = ("Cash", "Pending from Friends")


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegister, session: Session = Depends(get_session)) -> Token:
    hashed_password = get_password_hash(payload.password)
    user = UserModel(
        email=payload.email,
        hashed_password=hashed_password,
        first_name=payload.first_name,
        last_name=payload.last_name,
        age=payload.age,
    )
    session.add(user)
    try:
        session.flush()
        for account_name in DEFAULT_ACCOUNT_NAMES:
            session.add(
                AccountModel(
                    user_id=user.id,
                    name=account_name,
                    account_type="wallet",
                )
            )
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User with this email already exists")
    session.refresh(user)

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer", expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)
) -> Token:
    user = session.exec(select(UserModel).where(UserModel.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer", expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.get("/me", response_model=UserProfile)
def read_users_me(current_user: UserModel = Depends(get_current_user)) -> UserProfile:
    return UserProfile(
        email=current_user.email,
        display_name=current_user.first_name + " " + current_user.last_name,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


@router.get("/setup/accounts", response_model=list[AccountResponse])
def list_accounts(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[AccountModel]:
    user_id = current_user.id
    statement = select(AccountModel).where(AccountModel.user_id == user_id)
    return list(session.exec(statement).all())


@router.post("/setup/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: AccountCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> AccountModel:
    user_id = current_user.id   
    if user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to create accounts for this user")
        
    account = AccountModel(
        user_id=user_id,
        name=payload.name,
        account_type=payload.account_type,
        opening_balance=payload.opening_balance,
        current_balance=payload.opening_balance,
        currency=payload.currency,
        card_number=payload.card_number,
        expiration_date=payload.expiration_date,
        credit_limit=payload.credit_limit,
        billing_cycle_start=payload.billing_cycle_start,
        billing_cycle_end=payload.billing_cycle_end,
        notes=payload.notes,
    )
    session.add(account)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account name already exists for this user")
    session.refresh(account)
    return account


@router.patch("/setup/accounts/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: int,
    payload: AccountUpdate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> AccountModel:
    user_id = current_user.id        
    account = session.get(AccountModel, account_id)
    if not account or account.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
        
    values = payload.model_dump(exclude_unset=True)
    next_account_type = values.get("account_type", account.account_type)
    credit_card_fields = payload.provided_credit_card_fields()
    if next_account_type != AccountTypeEnum.CREDIT_CARD and credit_card_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Credit card fields are only allowed for credit card accounts",
        )

    if values.get("account_type") in {AccountTypeEnum.BANK_ACCOUNT, AccountTypeEnum.WALLET}:
        values.update(
            {
                "card_number": None,
                "expiration_date": None,
                "credit_limit": None,
                "billing_cycle_start": None,
                "billing_cycle_end": None,
            }
        )

    if "opening_balance" in values:
        difference = values["opening_balance"] - account.opening_balance
        new_current_balance = account.current_balance + difference
        values["current_balance"] = new_current_balance

    for field, value in values.items():
        setattr(account, field, value)
        
    session.add(account)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account name already exists for this user")
    session.refresh(account)
    return account


@router.patch("/setup/accounts/defaults/opening-balances", response_model=list[AccountResponse])
def setup_default_opening_balances(
    payload: DefaultAccountsOpeningBalanceSetup,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[AccountModel]:
    user_id = current_user.id
    statement = select(AccountModel).where(
        AccountModel.user_id == user_id,
        func.lower(AccountModel.name).in_(("cash", "pending from friends")),
    )
    accounts = list(session.exec(statement).all())
    account_by_name = {account.name.lower(): account for account in accounts}

    cash_account = account_by_name.get("cash")
    pending_account = account_by_name.get("pending from friends")
    if cash_account is None or pending_account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Default accounts not found for current user",
        )

    updates = (
        (cash_account, payload.cash_opening_balance),
        (pending_account, payload.pending_from_friends_opening_balance),
    )
    for account, next_opening_balance in updates:
        difference = next_opening_balance - account.opening_balance
        account.opening_balance = next_opening_balance
        account.current_balance = account.current_balance + difference
        session.add(account)

    session.commit()
    session.refresh(cash_account)
    session.refresh(pending_account)
    return [cash_account, pending_account]


@router.get("/setup/categories", response_model=CategoryGroupsResponse)
def list_categories(
    kind: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> CategoryGroupsResponse:
    user_id = current_user.id
    statement = select(CategoryModel).where((CategoryModel.user_id == user_id) | (CategoryModel.is_global == True))
    if kind is not None:
        statement = statement.where(CategoryModel.kind == kind)
    categories = list(session.exec(statement).all())
    grouped = CategoryGroupsResponse()
    for category in categories:
        getattr(grouped, category.kind).append(CategoryResponse.model_validate(category, from_attributes=True))
    return grouped


@router.post("/setup/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> CategoryModel:
    user_id = current_user.id
    existing = session.exec(
        select(CategoryModel).where(
            CategoryModel.kind == payload.kind,
            CategoryModel.name == payload.name,
            (CategoryModel.user_id == user_id) | (CategoryModel.is_global == True),
        )
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")

    category = CategoryModel(
        user_id=user_id,
        kind=payload.kind,
        name=payload.name
    )
    session.add(category)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")
    session.refresh(category)
    return category


@router.get("/setup/tags", response_model=list[TagResponse])
def list_tags(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[TagModel]:
    user_id = current_user.id
    statement = select(TagModel).where((TagModel.user_id == user_id) | (TagModel.is_global == True))
    return list(session.exec(statement).all())


@router.post("/setup/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: TagCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> TagModel:
    user_id = current_user.id   
    tag = TagModel(
        user_id=user_id,
        name=payload.name,
        color=payload.color
    )
    session.add(tag)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists for this user")
    session.refresh(tag)
    return tag


@router.get("/setup/goals", response_model=list[GoalResponse])
def list_goals(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[GoalModel]:
    user_id = current_user.id
    statement = select(GoalModel).where(GoalModel.user_id == user_id)
    return list(session.exec(statement).all())


@router.post("/setup/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> GoalModel:
    user_id = current_user.id
    goal = GoalModel(
        user_id=user_id,
        name=payload.name,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        target_date=payload.target_date,
    )
    session.add(goal)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Goal already exists for this user")
    session.refresh(goal)
    return goal


def get_budget_spent_amount(session: Session, user_id: int, budget: BudgetModel) -> Decimal:
    statement = select(func.coalesce(func.sum(TransactionModel.amount), 0)).where(
        TransactionModel.user_id == user_id,
        TransactionModel.transaction_type == "EXPENSE",
        TransactionModel.date >= budget.start_date,
        TransactionModel.date <= budget.end_date,
    )
    if budget.category_id is not None:
        statement = statement.where(TransactionModel.category_id == budget.category_id)
    return session.exec(statement).one()


def to_budget_response(session: Session, user_id: int, budget: BudgetModel) -> BudgetResponse:
    spent_amount = get_budget_spent_amount(session, user_id, budget)
    remaining_amount = budget.amount - spent_amount
    return BudgetResponse(
        id=budget.id,
        user_id=budget.user_id,
        name=budget.name,
        amount=budget.amount,
        category_id=budget.category_id,
        start_date=budget.start_date,
        end_date=budget.end_date,
        notes=budget.notes,
        is_active=budget.is_active,
        created_at=budget.created_at,
        updated_at=budget.updated_at,
        spent_amount=spent_amount,
        remaining_amount=remaining_amount,
    )


@router.get("/setup/budgets", response_model=list[BudgetResponse])
def list_budgets(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[BudgetResponse]:
    user_id = current_user.id
    statement = select(BudgetModel).where(BudgetModel.user_id == user_id).order_by(BudgetModel.created_at.desc())
    budgets = list(session.exec(statement).all())
    return [to_budget_response(session, user_id, budget) for budget in budgets]


@router.post("/setup/budgets", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(
    payload: BudgetCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> BudgetResponse:
    user_id = current_user.id

    if payload.category_id is not None:
        category = session.get(CategoryModel, payload.category_id)
        if not category or (category.user_id != user_id and not category.is_global):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        if category.kind != "expense":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Budgets can only be linked to expense categories",
            )

    budget = BudgetModel(
        user_id=user_id,
        name=payload.name,
        amount=payload.amount,
        category_id=payload.category_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        notes=payload.notes,
    )
    session.add(budget)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Budget already exists for this user")
    session.refresh(budget)
    return to_budget_response(session, user_id, budget)
