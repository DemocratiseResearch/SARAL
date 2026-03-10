"""
API-key service — encrypted storage and retrieval.
"""

from sqlmodel import Session, select

from app.models.api_key import ApiKey
from app.models.user import User
from app.utils.encryption import encrypt, decrypt


def save_keys(user: User, session: Session, keys: dict[str, str]):
    """
    Upsert API keys for a user.
    keys: {"gemini": "sk-...", "sarvam": "...", "openai": "..."}
    """
    for provider, raw_key in keys.items():
        if not raw_key:
            continue
        existing = session.exec(
            select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == provider)
        ).first()
        if existing:
            existing.encrypted_key = encrypt(raw_key)
            existing.is_valid = True
            session.add(existing)
        else:
            session.add(
                ApiKey(user_id=user.id, provider=provider, encrypted_key=encrypt(raw_key))
            )
    session.commit()


def get_keys(user: User, session: Session) -> dict[str, str]:
    """Return decrypted keys for the user, keyed by provider name."""
    rows = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).all()
    result: dict[str, str] = {}
    for row in rows:
        try:
            result[row.provider] = decrypt(row.encrypted_key)
        except Exception:
            result[row.provider] = ""
    return result


def get_key(user: User, session: Session, provider: str) -> str | None:
    """Get a single decrypted key for a provider."""
    row = session.exec(
        select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == provider)
    ).first()
    if not row:
        return None
    try:
        return decrypt(row.encrypted_key)
    except Exception:
        return None


def get_keys_status(user: User, session: Session) -> dict[str, bool]:
    """Return which providers the user has keys for (without exposing the keys)."""
    rows = session.exec(select(ApiKey).where(ApiKey.user_id == user.id)).all()
    return {row.provider: row.is_valid for row in rows}


def delete_key(user: User, session: Session, provider: str):
    row = session.exec(
        select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.provider == provider)
    ).first()
    if row:
        session.delete(row)
        session.commit()
