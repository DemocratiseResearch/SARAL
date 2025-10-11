# app/services/auth_service.py
import os
import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import HTTPException, status, Depends
from typing import Dict, Optional
import logging
from dotenv import load_dotenv

from app.firebase import db

load_dotenv()

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID") or "793861815991-khcse6r5elsbi44kkb9i8ib6akem58bg.apps.googleusercontent.com"
        self.jwt_secret = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
        self.jwt_algorithm = "HS256"
        self.token_expire_days = 7  # Changed from hours to days
        
        if not self.google_client_id:
            logger.warning("GOOGLE_CLIENT_ID not configured")
    
    def verify_firebase_token(self, token: str) -> Dict:
        """Verify Firebase ID token and extract user info"""
        try:
            decoded_token = firebase_auth.verify_id_token(token)
            uid = decoded_token['uid']
            user_record = firebase_auth.get_user(uid)
            return {
                'id': user_record.uid,
                'email': user_record.email,
                'name': user_record.display_name,
                'picture': user_record.photo_url,
                'verified_email': user_record.email_verified
            }
        except Exception as e:
            logger.error(f"Firebase token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Firebase token"
            )

    def get_or_create_user(self, user_data: dict) -> dict:
        users_ref = db.collection('users')
        user_doc = users_ref.document(user_data['id']).get()
        if user_doc.exists:
            return user_doc.to_dict()
        new_user = {
            'id': user_data['id'],
            'email': user_data['email'],
            'name': user_data.get('name', ''),
            'picture': user_data.get('picture', ''),
            'verified_email': user_data.get('verified_email', False)
        }
        users_ref.document(new_user['id']).set(new_user)
        return new_user

    # Firebase handles access tokens, so no need for custom JWT creation/verification
    def verify_access_token(self, token: str) -> Dict:
        """Verify Firebase ID token and return user data"""
        return self.verify_firebase_token(token)

# Global auth service instance
auth_service = AuthService()
