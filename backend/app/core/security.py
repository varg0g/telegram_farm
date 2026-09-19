import hashlib
import secrets
import time
from typing import Optional
from fastapi import Request, HTTPException, status
from app.core.config import settings

# Активные сессии: token -> timestamp создания
ACTIVE_SESSIONS = {}
SESSION_TTL = 7 * 24 * 3600  # 7 дней

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

# Хэш дефолтного админского пароля
ADMIN_HASH = hash_password(settings.ADMIN_PASSWORD)

def verify_password(password: str) -> bool:
    return hash_password(password) == ADMIN_HASH

def create_session() -> str:
    token = secrets.token_urlsafe(32)
    ACTIVE_SESSIONS[token] = time.time()
    return token

def validate_session(token: Optional[str]) -> bool:
    if not token:
        return False
    created_at = ACTIVE_SESSIONS.get(token)
    if not created_at:
        return False
    if time.time() - created_at > SESSION_TTL:
        ACTIVE_SESSIONS.pop(token, None)
        return False
    return True

async def get_current_admin(request: Request):
    """FastAPI зависимость для защиты эндпоинтов авторизацией."""
    if not settings.AUTH_REQUIRED:
        return True

    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    auth_header = request.headers.get("Authorization")
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        
    if not validate_session(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Необходима авторизация"
        )
    return True
