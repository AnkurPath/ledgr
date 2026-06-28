from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from ledgr.core.db import get_session
from ledgr.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_password_hash, verify_password, get_current_user
from ledgr.features.users.models import AccountModel, CategoryModel, TagModel, UserModel
from ledgr.features.users.schemas import (
    Token,
    UserRegister,
    UserProfile,
    AccountCreate, AccountResponse, AccountUpdate,
    CategoryCreate, CategoryResponse,
    TagCreate, TagResponse
)


router = APIRouter(prefix="/users", tags=["users"])


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
        currency=payload.currency
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


@router.get("/setup/categories", response_model=list[CategoryResponse])
def list_categories(
    kind: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[CategoryModel]:
    user_id = current_user.id
    statement = select(CategoryModel).where(CategoryModel.user_id == user_id)
    if kind is not None:
        statement = statement.where(CategoryModel.kind == kind)
    return list(session.exec(statement).all())


@router.post("/setup/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> CategoryModel:
    user_id = current_user.id    
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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists for this user")
    session.refresh(category)
    return category


@router.get("/setup/tags", response_model=list[TagResponse])
def list_tags(
    session: Session = Depends(get_session),
    current_user: UserModel = Depends(get_current_user)
) -> list[TagModel]:
    user_id = current_user.id
    statement = select(TagModel).where(TagModel.user_id == user_id)
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
