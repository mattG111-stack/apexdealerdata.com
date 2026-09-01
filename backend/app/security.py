"""JWT auth + password hashing + role guards."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, UserRole, UserStatus

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/sign-in", auto_error=True)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    payload = {"sub": str(user_id), "exp": expires}
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires


def _credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    """Any authenticated, non-rejected/deactivated user. PENDING users are allowed
    through so they can complete self-serve onboarding (verify + add card); product
    access is gated separately by require_active."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise _credentials_error()
    user = db.get(User, user_id)
    if user is None:
        raise _credentials_error()
    if user.status in (UserStatus.REJECTED.value, UserStatus.DEACTIVATED.value):
        raise HTTPException(status_code=403, detail=f"Account is {user.status}")
    return user


# Stripe states that mean the customer is in their trial or actively paying.
ACTIVE_SUBSCRIPTION_STATES = {"trialing", "active"}


def has_product_access(user: User) -> bool:
    """True if the user may see the product. Admins and admin-approved users get
    in outright (they bypass billing); everyone else needs a live subscription —
    i.e. they've added a card and are trialing or paying."""
    if user.role == UserRole.ADMIN.value:
        return True
    if user.status == UserStatus.APPROVED.value:
        return True
    return (user.subscription_status or "") in ACTIVE_SUBSCRIPTION_STATES


def require_active(user: User = Depends(current_user)) -> User:
    """Gate for the actual product. Returns 402 (Payment Required) when the user
    is authenticated but hasn't finished onboarding, so the frontend can route
    them to the paywall rather than treating it as a hard forbidden."""
    if not has_product_access(user):
        raise HTTPException(status_code=402, detail="onboarding_incomplete")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin only")
    if user.status != UserStatus.APPROVED.value:
        raise HTTPException(status_code=403, detail=f"Account is {user.status}")
    return user


def ensure_seed_admin(db: Session) -> None:
    """Create the seed admin user on first boot if no admin exists."""
    has_admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if has_admin:
        return
    admin = User(
        email=settings.seed_admin_email,
        password_hash=hash_password(settings.seed_admin_password),
        full_name="Seed Admin",
        role=UserRole.ADMIN.value,
        status=UserStatus.APPROVED.value,
    )
    db.add(admin)
    db.commit()
