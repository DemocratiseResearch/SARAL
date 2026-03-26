# app/auth/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from app.services.auth_service import auth_service

security = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> dict:
    """Dependency to get current authenticated user (required) using Firebase Auth"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user_data = auth_service.verify_access_token(credentials.credentials)
    # Ensure user exists in Firestore
    auth_service.get_or_create_user(user_data)
    return user_data

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[dict]:
    """Dependency to get current user if authenticated (optional) using Firebase Auth"""
    if not credentials:
        return None
    try:
        user_data = auth_service.verify_access_token(credentials.credentials)
        auth_service.get_or_create_user(user_data)
        return user_data
    except HTTPException:
        return None

def require_auth(func):
    """Decorator for route handlers that require authentication"""
    from functools import wraps
    
    @wraps(func)
    async def wrapper(*args, current_user: dict = Depends(get_current_user), **kwargs):
        return await func(*args, current_user=current_user, **kwargs)
    return wrapper
