# app/services/auth_service.py
import os
import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import HTTPException, status, Depends
from typing import Dict, Optional
import logging
from dotenv import load_dotenv
import jwt  # PyJWT – used only for the optional dev-token bypass
from app.utils.timing import track_performance
from app.firebase import db

load_dotenv()

logger = logging.getLogger(__name__)

class AuthService:
    @track_performance
    def __init__(self):
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.jwt_secret = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
        self.jwt_algorithm = "HS256"
        self.token_expire_days = 7  # Changed from hours to days
        
        if not self.google_client_id:
            logger.warning("GOOGLE_CLIENT_ID not configured")
    @track_performance
    def verify_firebase_token(self, token: str) -> Dict:
        """Verify Firebase ID token and extract user info"""
        print("verifying")
        try:
            decoded_token = firebase_auth.verify_id_token(token)
            uid = decoded_token['uid']
            user_record = firebase_auth.get_user(uid)
            
            return {
                'id': user_record.uid,
                'email': user_record.email,
                'name': user_record.display_name,
                'picture': user_record.photo_url,
                'verified_email': user_record.email_verified,
            }
        except Exception as e:
            print(f"DEBUG: Firebase token verification failed: {e}")
            logger.error(f"Firebase token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Firebase token"
            )

    @track_performance
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
    @track_performance
    def verify_access_token(self, token: str) -> Dict:
        if os.getenv('ENABLE_DEV_TOKEN', 'false').lower() == 'true':
            try:
                # Peek at the payload WITHOUT verifying the signature first,
                # just to check the token type.  This is safe because we fully
                # verify with the secret in the next step if it looks like a
                # dev token.
                unverified = jwt.decode(
                    token,
                    options={"verify_signature": False},
                    algorithms=[self.jwt_algorithm],
                )
                if unverified.get('type') == 'dev_token':
                    # Hard-verify with our own secret (checks signature + expiry)
                    payload = jwt.decode(
                        token,
                        self.jwt_secret,
                        algorithms=[self.jwt_algorithm],
                    )
                    logger.info(
                        f"Dev-token auth accepted for: {payload.get('email', 'unknown')}"
                    )
                    return payload
            except jwt.ExpiredSignatureError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Dev token has expired – regenerate it with generate_dev_token.py",
                )
            except jwt.InvalidTokenError as e:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"Invalid dev token: {e}",
                )
            except Exception:
                # Any other error (e.g. not a JWT at all) → let Firebase handle it
                pass

        return self.verify_firebase_token(token)

# Global auth service instance
auth_service = AuthService()
