"""
Auth routes — Google/Firebase login.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.schemas.auth import GoogleLoginRequest, AuthResponse, UserResponse
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google-login", response_model=AuthResponse)
async def google_login(
    request: GoogleLoginRequest,
    session: Session = Depends(get_session),
):
    """
    Verify the Firebase ID token sent from the front-end and upsert the user.
    The front-end already authenticated with Firebase; this endpoint just
    confirms the token and returns the user profile.
    """
    from app.auth import verify_firebase_token
    from sqlmodel import select

    token_data = verify_firebase_token(request.id_token)

    user = session.exec(
        select(User).where(User.firebase_uid == token_data["firebase_uid"])
    ).first()
    if user:
        user.name = token_data.get("name") or user.name
        user.picture = token_data.get("picture") or user.picture
    else:
        user = User(
            firebase_uid=token_data["firebase_uid"],
            email=token_data["email"],
            name=token_data.get("name", ""),
            picture=token_data.get("picture"),
            verified_email=token_data.get("verified_email", False),
        )
    session.add(user)
    session.commit()
    session.refresh(user)

    return AuthResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name or "",
            picture=user.picture,
        ),
        message="Login successful",
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name or "",
        picture=user.picture,
    )
