"""
Firebase Admin SDK initialization.
Reads credentials from FIREBASE_SERVICE_ACCOUNT_BASE64 env var (preferred)
or falls back to FIREBASE_SERVICE_ACCOUNT_PATH file path.
"""

import base64
import json
import logging
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_app = None


def init_firebase():
    """Initialize Firebase Admin SDK. Safe to call multiple times."""
    global _app
    if _app is not None:
        return _app

    cred = None

    # Option 1: Base64-encoded service account JSON (works in Docker / CI)
    if settings.FIREBASE_SERVICE_ACCOUNT_BASE64:
        try:
            decoded = base64.b64decode(settings.FIREBASE_SERVICE_ACCOUNT_BASE64)
            service_info = json.loads(decoded)
            cred = credentials.Certificate(service_info)
            logger.info("Firebase initialized from base64 env var")
        except Exception as e:
            logger.error(f"Failed to decode FIREBASE_SERVICE_ACCOUNT_BASE64: {e}")

    # Option 2: File path to service account JSON
    if cred is None and settings.FIREBASE_SERVICE_ACCOUNT_PATH:
        try:
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
            logger.info(f"Firebase initialized from file: {settings.FIREBASE_SERVICE_ACCOUNT_PATH}")
        except Exception as e:
            logger.error(f"Failed to load Firebase credentials from file: {e}")

    if cred is None:
        logger.warning(
            "No Firebase credentials configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 "
            "or FIREBASE_SERVICE_ACCOUNT_PATH in your .env file."
        )
        return None

    _app = firebase_admin.initialize_app(cred)
    return _app


def verify_firebase_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return user info.
    Raises ValueError if the token is invalid.
    """
    if _app is None:
        raise ValueError("Firebase is not initialized")

    decoded = firebase_auth.verify_id_token(id_token)
    uid = decoded["uid"]
    user_record = firebase_auth.get_user(uid)

    return {
        "firebase_uid": user_record.uid,
        "email": user_record.email or "",
        "name": user_record.display_name or "",
        "picture": user_record.photo_url or "",
        "verified_email": user_record.email_verified,
    }
