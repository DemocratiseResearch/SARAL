# app/routes/auth.py
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from app.services.auth_service import auth_service
from app.auth.dependencies import get_current_user
from app.database import get_db, User
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class GoogleLoginRequest(BaseModel):
    token: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: str

@router.post("/google/login", response_model=AuthResponse)
async def google_login(request: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Authenticate with Google and return JWT token"""
    try:
        # Verify Google token
        google_user_data = auth_service.verify_google_token(request.token)
        
        # Get or create user in the database
        user = auth_service.get_or_create_user(db, google_user_data)

        user_data_for_token = {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture
        }

        # Create JWT token
        access_token = auth_service.create_access_token(user_data_for_token)
        
        logger.info(f"User authenticated: {user.email}")
        
        return AuthResponse(
            access_token=access_token,
            user=user_data_for_token
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.get("/me", response_model=UserResponse)
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    return UserResponse(
        id=current_user['id'],
        email=current_user['email'],
        name=current_user['name'],
        picture=current_user.get('picture', '')
    )

@router.post("/logout")
async def logout():
    """Logout (client should discard token)"""
    return {"message": "Logged out successfully"}

@router.get("/verify")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Verify if token is valid"""
    return {
        "valid": True,
        "user": {
            "id": current_user['id'],
            "email": current_user['email'],
            "name": current_user['name']
        }
    }
