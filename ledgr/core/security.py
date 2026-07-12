from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Optional
from uuid import UUID

from pwdlib import PasswordHash
import jwt

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from jwt.exceptions import InvalidTokenError

from ledgr.core.config import settings
from ledgr.core.db import get_session
from ledgr.features.users.models import RefreshTokenModel, UserModel


# Password Hashing
password_hash = PasswordHash.recommended()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


# JWT Token Management
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="users/token")  # Endpoint for token requests

SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
REFRESH_TOKEN_EXPIRE_DAYS = settings.refresh_token_expire_days


def authenticate_user(session: Session, email: str, password: str) -> Optional[UserModel]:
    user = session.exec(select(UserModel).where(UserModel.email == email)).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def create_refresh_token(*, session: Session, user_id: UUID) -> str:
    raw_token = secrets.token_urlsafe(48)
    session.add(
        RefreshTokenModel(
            user_id=user_id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    session.commit()
    return raw_token


def _get_valid_refresh_token(*, session: Session, raw_token: str) -> RefreshTokenModel:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    record = session.exec(
        select(RefreshTokenModel).where(RefreshTokenModel.token_hash == hash_refresh_token(raw_token))
    ).first()
    if record is None or record.revoked_at is not None:
        raise credentials_exception
    if _as_utc(record.expires_at) <= datetime.now(timezone.utc):
        raise credentials_exception
    return record


def rotate_refresh_token(*, session: Session, raw_token: str) -> tuple[UserModel, str]:
    record = _get_valid_refresh_token(session=session, raw_token=raw_token)
    user = session.get(UserModel, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    record.revoked_at = datetime.now(timezone.utc)
    session.add(record)
    session.commit()

    new_refresh_token = create_refresh_token(session=session, user_id=user.id)
    return user, new_refresh_token


def revoke_refresh_token(*, session: Session, raw_token: str) -> None:
    record = session.exec(
        select(RefreshTokenModel).where(RefreshTokenModel.token_hash == hash_refresh_token(raw_token))
    ).first()
    if record is None or record.revoked_at is not None:
        return
    record.revoked_at = datetime.now(timezone.utc)
    session.add(record)
    session.commit()


def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> UserModel:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception

    user = session.exec(select(UserModel).where(UserModel.email == username)).first()
    if user is None:
        raise credentials_exception
    return user
