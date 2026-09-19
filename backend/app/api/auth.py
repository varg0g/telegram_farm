from fastapi import APIRouter, Response, Request, HTTPException
from pydantic import BaseModel
from app.core.security import verify_password, create_session, validate_session
from app.core.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    password: str

@router.post("/login")
async def login(req: LoginRequest, response: Response):
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    
    token = create_session()
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=7 * 24 * 3600,
        samesite="lax"
    )
    return {"status": "ok", "token": token}

@router.get("/me")
async def check_auth(request: Request):
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        
    if not validate_session(token):
        raise HTTPException(status_code=401, detail="Не авторизован")
    return {"status": "ok", "authenticated": True}

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(settings.SESSION_COOKIE_NAME)
    return {"status": "ok"}
