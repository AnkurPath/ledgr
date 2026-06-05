from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from ledgr.features.users.models import UserAccountModel, UserCategoryModel, UserModel, UserTagModel


def fetch_user_or_404(session: Session, user_id: int) -> UserModel:
    user = session.get(UserModel, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def fetch_account_or_404(session: Session, user_id: int, account_id: int) -> UserAccountModel:
    statement = select(UserAccountModel).where(UserAccountModel.user_id == user_id, UserAccountModel.id == account_id)
    account = session.exec(statement).first()
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


def fetch_category_or_404(session: Session, user_id: int, category_id: int) -> UserCategoryModel:
    statement = select(UserCategoryModel).where(
        UserCategoryModel.user_id == user_id,
        UserCategoryModel.id == category_id,
    )
    category = session.exec(statement).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def fetch_tag_or_404(session: Session, user_id: int, tag_id: int) -> UserTagModel:
    statement = select(UserTagModel).where(UserTagModel.user_id == user_id, UserTagModel.id == tag_id)
    tag = session.exec(statement).first()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    return tag


def ensure_username_available(session: Session, username: str, user_id: Optional[int] = None) -> None:
    statement = select(UserModel).where(UserModel.username == username)
    existing = session.exec(statement).first()
    if existing is not None and existing.id != user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")


def ensure_account_name_available(
    session: Session,
    user_id: int,
    name: str,
    account_id: Optional[int] = None,
) -> None:
    statement = select(UserAccountModel).where(UserAccountModel.user_id == user_id, UserAccountModel.name == name)
    existing = session.exec(statement).first()
    if existing is not None and existing.id != account_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists")


def ensure_category_available(
    session: Session,
    user_id: int,
    kind: str,
    name: str,
    category_id: Optional[int] = None,
) -> None:
    statement = select(UserCategoryModel).where(
        UserCategoryModel.user_id == user_id,
        UserCategoryModel.kind == kind,
        UserCategoryModel.name == name,
    )
    existing = session.exec(statement).first()
    if existing is not None and existing.id != category_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Category already exists")


def ensure_tag_name_available(session: Session, user_id: int, name: str, tag_id: Optional[int] = None) -> None:
    statement = select(UserTagModel).where(UserTagModel.user_id == user_id, UserTagModel.name == name)
    existing = session.exec(statement).first()
    if existing is not None and existing.id != tag_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already exists")
