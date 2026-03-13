"""
FastAPI dependencies for authentication.
Extracts the Firebase ID token from the Authorization header,
verifies it, and returns the current user's DB record.
"""

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from typing import Optional

from app.database import get_session
from app.auth import verify_firebase_token
from app.models.user import User

security = HTTPBearer(auto_error=False)


def _get_or_create_user(session: Session, user_info: dict) -> User:
    """Find existing user by firebase_uid, or create a new row."""
    stmt = select(User).where(User.firebase_uid == user_info["firebase_uid"])
    user = session.exec(stmt).first()
    if user:
        # Update profile fields in case they changed on the Firebase side
        user.email = user_info["email"]
        user.name = user_info["name"]
        user.picture = user_info["picture"]
        user.verified_email = user_info["verified_email"]
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    user = User(**user_info)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
) -> User:
    """Required auth dependency — returns the User ORM object."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_info = verify_firebase_token(credentials.credentials)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return _get_or_create_user(session, user_info)


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """Optional auth — returns None when no token is provided."""
    if not credentials:
        return None
    try:
        user_info = verify_firebase_token(credentials.credentials)
        return _get_or_create_user(session, user_info)
    except Exception:
        return None


async def get_current_user_from_token_param(
    token: str = Query(..., alias="token"),
    session: Session = Depends(get_session),
) -> User:
    """Auth via query parameter — for <audio>/<img>/<video> src URLs."""
    try:
        user_info = verify_firebase_token(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return _get_or_create_user(session, user_info)
