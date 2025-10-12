# app/services/auth_service.py
import os
import jwt
from datetime import datetime, timedelta
from google.oauth2 import id_token
from google.auth.transport import requests
from fastapi import HTTPException, status, Depends
from typing import Dict, Optional
import logging
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from app.database import get_db, User

load_dotenv()

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.jwt_secret = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
        self.jwt_algorithm = "HS256"
        self.token_expire_days = 7  # Changed from hours to days
        
        if not self.google_client_id:
            logger.warning("GOOGLE_CLIENT_ID not configured")
    
    def verify_google_token(self, token: str) -> Dict:
        """Verify Google ID token and extract user info"""
        try:
            idinfo = id_token.verify_oauth2_token(
                token, requests.Request(), self.google_client_id
            )
            
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Invalid token issuer')
                
            return {
                'id': idinfo['sub'],
                'email': idinfo['email'],
                'name': idinfo['name'],
                'picture': idinfo.get('picture', ''),
                'verified_email': idinfo.get('email_verified', False)
            }
        except Exception as e:
            logger.error(f"Google token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token"
            )

    def get_or_create_user(self, db: Session, user_data: dict) -> User:
        user = db.query(User).filter(User.email == user_data['email']).first()
        if not user:
            db_user = User(
                id=user_data['id'],
                email=user_data['email'],
                name=user_data['name'],
                picture=user_data.get('picture')
            )
            db.add(db_user)
            db.commit()
            db.refresh(db_user)
            return db_user
        return user

    def create_access_token(self, user_data: Dict) -> str:
        """Create JWT access token"""
        try:
            expire = datetime.utcnow() + timedelta(days=self.token_expire_days) # Changed to days
            payload = {
                **user_data,
                'exp': expire,
                'iat': datetime.utcnow(),
                'type': 'access_token'
            }
            
            token = jwt.encode(payload, self.jwt_secret, algorithm=self.jwt_algorithm)
            return token if isinstance(token, str) else token.decode('utf-8')
            
        except Exception as e:
            logger.error(f"Token creation failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create access token"
            )
    
    def verify_access_token(self, token: str) -> Dict:
        """Verify JWT access token and return user data"""
        try:
            payload = jwt.decode(
                token, 
                self.jwt_secret, 
                algorithms=[self.jwt_algorithm]
            )
            
            if payload.get('type') != 'access_token':
                raise jwt.InvalidTokenError("Invalid token type")
                
            return payload
            
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except jwt.InvalidTokenError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )

# Global auth service instance
auth_service = AuthService()
