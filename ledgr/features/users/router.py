from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlmodel import Session, select

from ledgr.core.db import get_session
from ledgr.features.users.models import UserAccountModel, UserCategoryModel, UserModel, UserTagModel
from ledgr.features.users.schemas import (
    Account,
    AccountCreate,
    AccountUpdate,
    Category,
    CategoryCreate,
    CategoryKind,
    CategoryUpdate,
    Tag,
    TagCreate,
    TagUpdate,
    User,
    UserCreate,
    UserUpdate,
)
from ledgr.features.users.service import (
    ensure_account_name_available,
    ensure_category_available,
    ensure_tag_name_available,
    ensure_username_available,
    fetch_account_or_404,
    fetch_category_or_404,
    fetch_tag_or_404,
    fetch_user_or_404,
)


router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=User, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, session: Session = Depends(get_session)) -> User:
    ensure_username_available(session, payload.username)
    user = UserModel(
        username=payload.username,
        display_name=payload.display_name,
        is_active=payload.is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return User.model_validate(user)


@router.get("", response_model=list[User])
def list_users(
    include_inactive: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[User]:
    statement = select(UserModel).order_by(UserModel.username)
    if not include_inactive:
        statement = statement.where(UserModel.is_active == True)  # noqa: E712
    return [User.model_validate(user) for user in session.exec(statement).all()]


@router.get("/{user_id}", response_model=User)
def get_user(user_id: int, session: Session = Depends(get_session)) -> User:
    return User.model_validate(fetch_user_or_404(session, user_id))


@router.patch("/{user_id}", response_model=User)
def update_user(user_id: int, payload: UserUpdate, session: Session = Depends(get_session)) -> User:
    user = fetch_user_or_404(session, user_id)
    values = payload.model_dump(exclude_unset=True)
    if "username" in values:
        ensure_username_available(session, values["username"], user_id=user_id)
    for field, value in values.items():
        setattr(user, field, value)
    session.commit()
    session.refresh(user)
    return User.model_validate(user)


@router.post("/{user_id}/setup/accounts", response_model=Account, status_code=status.HTTP_201_CREATED)
def create_account(user_id: int, payload: AccountCreate, session: Session = Depends(get_session)) -> Account:
    fetch_user_or_404(session, user_id)
    ensure_account_name_available(session, user_id, payload.name)
    account = UserAccountModel(
        user_id=user_id,
        name=payload.name,
        account_type=payload.account_type,
        opening_balance=payload.opening_balance,
        is_active=payload.is_active,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return Account.model_validate(account)


@router.get("/{user_id}/setup/accounts", response_model=list[Account])
def list_accounts(
    user_id: int,
    include_inactive: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[Account]:
    fetch_user_or_404(session, user_id)
    statement = select(UserAccountModel).where(UserAccountModel.user_id == user_id).order_by(UserAccountModel.name)
    if not include_inactive:
        statement = statement.where(UserAccountModel.is_active == True)  # noqa: E712
    return [Account.model_validate(account) for account in session.exec(statement).all()]


@router.patch("/{user_id}/setup/accounts/{account_id}", response_model=Account)
def update_account(
    user_id: int,
    account_id: int,
    payload: AccountUpdate,
    session: Session = Depends(get_session),
) -> Account:
    account = fetch_account_or_404(session, user_id, account_id)
    values = payload.model_dump(exclude_unset=True)
    if "name" in values:
        ensure_account_name_available(session, user_id, values["name"], account_id=account_id)
    for field, value in values.items():
        setattr(account, field, value)
    session.commit()
    session.refresh(account)
    return Account.model_validate(account)


@router.delete("/{user_id}/setup/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(user_id: int, account_id: int, session: Session = Depends(get_session)) -> Response:
    account = fetch_account_or_404(session, user_id, account_id)
    session.delete(account)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/setup/categories", response_model=Category, status_code=status.HTTP_201_CREATED)
def create_category(user_id: int, payload: CategoryCreate, session: Session = Depends(get_session)) -> Category:
    fetch_user_or_404(session, user_id)
    ensure_category_available(session, user_id, payload.kind.value, payload.name)
    category = UserCategoryModel(
        user_id=user_id,
        kind=payload.kind.value,
        name=payload.name,
        is_active=payload.is_active,
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return Category.model_validate(category)


@router.get("/{user_id}/setup/categories", response_model=list[Category])
def list_categories(
    user_id: int,
    kind: Optional[CategoryKind] = Query(default=None),
    include_inactive: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[Category]:
    fetch_user_or_404(session, user_id)
    statement = select(UserCategoryModel).where(UserCategoryModel.user_id == user_id).order_by(
        UserCategoryModel.kind,
        UserCategoryModel.name,
    )
    if kind is not None:
        statement = statement.where(UserCategoryModel.kind == kind.value)
    if not include_inactive:
        statement = statement.where(UserCategoryModel.is_active == True)  # noqa: E712
    return [Category.model_validate(category) for category in session.exec(statement).all()]


@router.patch("/{user_id}/setup/categories/{category_id}", response_model=Category)
def update_category(
    user_id: int,
    category_id: int,
    payload: CategoryUpdate,
    session: Session = Depends(get_session),
) -> Category:
    category = fetch_category_or_404(session, user_id, category_id)
    values = payload.model_dump(exclude_unset=True)
    next_kind = values.get("kind", category.kind)
    if isinstance(next_kind, CategoryKind):
        next_kind = next_kind.value
    next_name = values.get("name", category.name)
    if "kind" in values or "name" in values:
        ensure_category_available(session, user_id, next_kind, next_name, category_id=category_id)
    if "kind" in values and isinstance(values["kind"], CategoryKind):
        values["kind"] = values["kind"].value
    for field, value in values.items():
        setattr(category, field, value)
    session.commit()
    session.refresh(category)
    return Category.model_validate(category)


@router.delete("/{user_id}/setup/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(user_id: int, category_id: int, session: Session = Depends(get_session)) -> Response:
    category = fetch_category_or_404(session, user_id, category_id)
    session.delete(category)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/setup/tags", response_model=Tag, status_code=status.HTTP_201_CREATED)
def create_tag(user_id: int, payload: TagCreate, session: Session = Depends(get_session)) -> Tag:
    fetch_user_or_404(session, user_id)
    ensure_tag_name_available(session, user_id, payload.name)
    tag = UserTagModel(user_id=user_id, name=payload.name, is_active=payload.is_active)
    session.add(tag)
    session.commit()
    session.refresh(tag)
    return Tag.model_validate(tag)


@router.get("/{user_id}/setup/tags", response_model=list[Tag])
def list_tags(
    user_id: int,
    include_inactive: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> list[Tag]:
    fetch_user_or_404(session, user_id)
    statement = select(UserTagModel).where(UserTagModel.user_id == user_id).order_by(UserTagModel.name)
    if not include_inactive:
        statement = statement.where(UserTagModel.is_active == True)  # noqa: E712
    return [Tag.model_validate(tag) for tag in session.exec(statement).all()]


@router.patch("/{user_id}/setup/tags/{tag_id}", response_model=Tag)
def update_tag(
    user_id: int,
    tag_id: int,
    payload: TagUpdate,
    session: Session = Depends(get_session),
) -> Tag:
    tag = fetch_tag_or_404(session, user_id, tag_id)
    values = payload.model_dump(exclude_unset=True)
    if "name" in values:
        ensure_tag_name_available(session, user_id, values["name"], tag_id=tag_id)
    for field, value in values.items():
        setattr(tag, field, value)
    session.commit()
    session.refresh(tag)
    return Tag.model_validate(tag)


@router.delete("/{user_id}/setup/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(user_id: int, tag_id: int, session: Session = Depends(get_session)) -> Response:
    tag = fetch_tag_or_404(session, user_id, tag_id)
    session.delete(tag)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
