"""
Session Tracking Middleware

Extracts or generates session_id for request tracking.
NO FRONTEND CHANGES REQUIRED - works with optional headers.
"""

import uuid
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from typing import Optional

logger = logging.getLogger(__name__)


class SessionTrackingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to track user sessions.
    
    Extracts session_id from:
    1. X-Session-ID header (if frontend provides it)
    2. Generates new UUID if not provided
    
    Stores in request.state for access in route handlers.
    BACKWARD COMPATIBLE - no frontend changes required!
    """
    
    async def dispatch(self, request: Request, call_next):
        # Try to get session_id from header (optional)
        session_id = request.headers.get("X-Session-ID") or request.headers.get("x-session-id")
        
        # If not provided, generate a new one
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Store in request state for access in handlers
        request.state.session_id = session_id
        
        # Also try to extract user info if JWT token present (optional)
        try:
            auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                # User authentication will be handled by get_current_user dependency
                # We just note that auth is present
                request.state.has_auth = True
            else:
                request.state.has_auth = False
        except Exception:
            request.state.has_auth = False
        
        # Process the request
        response = await call_next(request)
        
        # Optionally return session_id in response header (for frontend to cache)
        response.headers["X-Session-ID"] = session_id
        
        return response


def get_session_id(request: Request) -> str:
    """Helper function to get session_id from request state"""
    return getattr(request.state, 'session_id', str(uuid.uuid4()))


def get_user_context(request: Request, current_user: Optional[dict] = None) -> dict:
    """
    Extract user context for tracking.
    
    BACKWARD COMPATIBLE:
    - If user is logged in (current_user provided), use their info
    - If not logged in, use session_id only
    - No errors if data is missing
    """
    session_id = get_session_id(request)
    
    if current_user:
        return {
            'session_id': session_id,
            'user_id': current_user.get('id'),
            'user_email': current_user.get('email'),
            'is_authenticated': True
        }
    else:
        return {
            'session_id': session_id,
            'user_id': None,
            'user_email': None,
            'is_authenticated': False
        }
