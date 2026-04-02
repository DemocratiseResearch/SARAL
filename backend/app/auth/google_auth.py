# app/auth/google_auth.py
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests
import os
from typing import Optional
import jwt  # This will now work correctly with PyJWT
from datetime import datetime, timedelta
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

class GoogleAuthConfig:
    def __init__(self):
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.jwt_secret = os.getenv("JWT_SECRET")
        self.jwt_algorithm = "HS256"
        
        # Verify PyJWT is properly installed
        try:
            if not hasattr(jwt, 'encode'):
                raise ImportError("PyJWT not properly installed. Please run: pip install PyJWT")
        except Exception as e:
            logger.error(f"JWT library error: {e}")
            raise
        
        logger.info(f"Google Client ID configured: {'Yes' if self.google_client_id else 'No'}")
        logger.info(f"JWT Secret configured: {'Yes' if bool(self.jwt_secret) else 'No'}")
        logger.info(f"PyJWT version: {getattr(jwt, '__version__', 'Unknown')}")
        
        if not self.google_client_id:
            logger.warning("GOOGLE_CLIENT_ID environment variable is not set")
        if not self.jwt_secret:
            logger.warning("JWT_SECRET environment variable is not set")

config = GoogleAuthConfig()

class AuthService:
    @staticmethod
    def verify_google_token(token: str) -> dict:
        """Verify Google ID token and return user info"""
        try:
            logger.info("Verifying Google token...")
            idinfo = id_token.verify_oauth2_token(
                token, requests.Request(), config.google_client_id
            )
            
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')
                
            user_data = {
                'id': idinfo['sub'],
                'email': idinfo['email'],
                'name': idinfo['name'],
                'picture': idinfo.get('picture', ''),
                'verified_email': idinfo.get('email_verified', False)
            }
            
            logger.info(f"Google token verified for user: {user_data['email']}")
            return user_data
            
        except Exception as e:
            logger.error(f"Google token verification failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google token: {str(e)}"
            )
    
    @staticmethod
    def create_access_token(user_data: dict) -> str:
        """Create JWT access token"""
        try:
            logger.info("Creating access token...")

            if not config.jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="JWT_SECRET is not configured"
                )
            
            # Verify jwt.encode is available
            if not hasattr(jwt, 'encode'):
                raise AttributeError("PyJWT encode method not available. Please install PyJWT: pip install PyJWT")
            
            expire = datetime.utcnow() + timedelta(hours=24)
            to_encode = {
                **user_data,
                'exp': expire,
                'iat': datetime.utcnow(),
                'type': 'access_token'
            }
            
            # Use PyJWT to encode the token
            token = jwt.encode(to_encode, config.jwt_secret, algorithm=config.jwt_algorithm)
            
            # Handle different PyJWT versions
            if isinstance(token, bytes):
                token = token.decode('utf-8')
            
            logger.info(f"Access token created successfully for user: {user_data.get('email', 'unknown')}")
            return token
            
        except AttributeError as e:
            logger.error(f"JWT library error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT library not properly configured. Please install PyJWT."
            )
        except Exception as e:
            logger.error(f"Token creation failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create access token: {str(e)}"
            )
    
    @staticmethod
    def verify_access_token(token: str) -> dict:
        """Verify JWT access token"""
        try:
            logger.info("Verifying access token...")

            if not config.jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="JWT_SECRET is not configured"
                )
            
            # Verify jwt.decode is available
            if not hasattr(jwt, 'decode'):
                raise AttributeError("PyJWT decode method not available. Please install PyJWT: pip install PyJWT")
            
            payload = jwt.decode(
                token, 
                config.jwt_secret, 
                algorithms=[config.jwt_algorithm],
                options={"verify_exp": True}
            )
            
            # Verify token type
            if payload.get('type') != 'access_token':
                raise jwt.InvalidTokenError("Invalid token type")
            
            logger.info(f"Access token verified for user: {payload.get('email', 'unknown')}")
            return payload
            
        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"}
            )
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"}
            )
        except AttributeError as e:
            logger.error(f"JWT library error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="JWT library not properly configured"
            )
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token verification failed",
                headers={"WWW-Authenticate": "Bearer"}
            )

auth_service = AuthService()

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    """Dependency to get current authenticated user"""
    if not credentials:
        logger.warning("No credentials provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        token = credentials.credentials
        logger.info("Received token for verification")
        
        user_data = auth_service.verify_access_token(token)
        return user_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[dict]:
    """Optional dependency to get current user if authenticated"""
    if not credentials:
        return None
    try:
        return auth_service.verify_access_token(credentials.credentials)
    except HTTPException:
        return None
