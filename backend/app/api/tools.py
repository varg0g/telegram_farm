import asyncio
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
from pydantic import BaseModel
from app.core.security import get_current_admin
from app.core.config import UPLOADS_DIR
from app.services.task_engine import task_engine
from app.modules.leomatch.engine import run_leomatch_autolike, run_leomatch_warmup, run_leomatch_register
from app.modules.scraper.scraper import run_chat_scraper
from app.modules.sender.sender import run_mass_sender
from app.modules.profile_editor.editor import run_batch_profile_update

router = APIRouter(prefix="/api/tools", tags=["tools"], dependencies=[Depends(get_current_admin)])

class LeoMatchAutolikeRequest(BaseModel):
    account_phones: List[str]
    likes_per_account: int = 50
    min_delay: float = 3.0
    max_delay: float = 7.0
    dislike_ratio: float = 0.2

class LeoMatchWarmupRequest(BaseModel):
    account_phones: List[str]
    min_likes: int = 5
    max_likes: int = 15
    stop_on_match: bool = True
    max_duration_minutes: int = 60

class LeoMatchRegisterRequest(BaseModel):
    account_phones: List[str]
    gender: str = "Я парень"
    search_gender: str = "девушки"
    fixed_age: Optional[int] = None
    fixed_city: Optional[str] = None
    fixed_name: Optional[str] = None
    custom_bio: Optional[str] = None
    share_contact: bool = True
    join_channels: bool = True
    delay_min: float = 3.0
    delay_max: float = 6.0

class ScraperRequest(BaseModel):
    account_phone: str
    chat_username_or_link: str
    only_active: bool = True
    only_with_username: bool = True
    max_count: int = 500

class SenderRequest(BaseModel):
    account_phones: List[str]
    targets: List[str]
    message_template: str
    min_delay: float = 15.0
    max_delay: float = 35.0

class ProfileUpdateRequest(BaseModel):
    account_phones: List[str]
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    bio: Optional[str] = None
    set_username: bool = False
    set_avatar: bool = False
    enable_2fa: bool = False
    two_fa_password: Optional[str] = None
    two_fa_hint: Optional[str] = "farm"
    hide_phone: bool = True
    hide_search_by_phone: bool = True
    hide_last_seen: bool = False
    block_calls: bool = True
    block_p2p: bool = True
    block_invites: bool = True

@router.post("/leomatch/autolike")
async def api_start_leomatch_autolike(req: LeoMatchAutolikeRequest):
    if not req.account_phones:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты")
        
    task_id = f"leo_like_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="leomatch_autolike",
        title=f"Дайвинчик: Автолайкер ({len(req.account_phones)} акк.)",
        total=len(req.account_phones) * req.likes_per_account,
        account_phones=req.account_phones,
        config=req.model_dump()
    )
    
    asyncio.create_task(run_leomatch_autolike(
        task_id=task_id,
        account_phones=req.account_phones,
        likes_per_account=req.likes_per_account,
        min_delay=req.min_delay,
        max_delay=req.max_delay,
        dislike_ratio=req.dislike_ratio
    ))
    return {"status": "ok", "task_id": task_id}

@router.post("/leomatch/warmup")
async def api_start_leomatch_warmup(req: LeoMatchWarmupRequest):
    if not req.account_phones:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты")
        
    task_id = f"leo_warm_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="leomatch_warmup",
        title=f"Дайвинчик: Прогрев анкет ({len(req.account_phones)} акк.)",
        total=len(req.account_phones),
        account_phones=req.account_phones,
        config=req.model_dump()
    )
    
    asyncio.create_task(run_leomatch_warmup(
        task_id=task_id,
        account_phones=req.account_phones,
        min_likes=req.min_likes,
        max_likes=req.max_likes,
        stop_on_match=req.stop_on_match,
        max_duration_minutes=req.max_duration_minutes
    ))
    return {"status": "ok", "task_id": task_id}

@router.post("/leomatch/register")
async def api_start_leomatch_register(req: LeoMatchRegisterRequest):
    if not req.account_phones:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты")
        
    task_id = f"leo_reg_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="leomatch_register",
        title=f"Дайвинчик: Регистрация анкет ({len(req.account_phones)} акк.)",
        total=len(req.account_phones),
        account_phones=req.account_phones,
        config=req.model_dump()
    )
    
    asyncio.create_task(run_leomatch_register(
        task_id=task_id,
        account_phones=req.account_phones,
        gender=req.gender,
        search_gender=req.search_gender,
        fixed_age=req.fixed_age,
        fixed_city=req.fixed_city,
        fixed_name=req.fixed_name,
        custom_bio=req.custom_bio,
        share_contact=req.share_contact,
        join_channels=req.join_channels,
        delay_min=req.delay_min,
        delay_max=req.delay_max
    ))
    return {"status": "ok", "task_id": task_id}

@router.post("/leomatch/photos")
async def api_upload_leomatch_photos(files: List[UploadFile] = File(...)):
    """Загрузка фотографий для анкет Дайвинчика в uploads/leomatch."""
    save_dir = Path("backend/uploads/leomatch")
    save_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext in [".jpg", ".jpeg", ".png", ".webp"]:
            dest = save_dir / f"{uuid.uuid4().hex[:8]}_{f.filename}"
            content = await f.read()
            with open(dest, "wb") as out:
                out.write(content)
            count += 1
    return {"status": "ok", "uploaded": count}

@router.get("/leomatch/photos-count")
async def api_get_leomatch_photos_count():
    save_dir = Path("backend/uploads/leomatch")
    count = 0
    if save_dir.exists():
        count = len([f for f in save_dir.iterdir() if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]])
    return {"count": count}

@router.delete("/leomatch/photos")
async def api_clear_leomatch_photos():
    save_dir = Path("backend/uploads/leomatch")
    if save_dir.exists():
        for f in save_dir.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass
    return {"status": "ok"}

# Аватарки для профилей
@router.post("/profile/avatars")
async def api_upload_profile_avatars(files: List[UploadFile] = File(...)):
    """Загрузка фотографий для аватарок профилей в uploads/avatars."""
    save_dir = Path("backend/uploads/avatars")
    save_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext in [".jpg", ".jpeg", ".png", ".webp"]:
            dest = save_dir / f"{uuid.uuid4().hex[:8]}_{f.filename}"
            content = await f.read()
            with open(dest, "wb") as out:
                out.write(content)
            count += 1
    return {"status": "ok", "uploaded": count}

@router.get("/profile/avatars-count")
async def api_get_profile_avatars_count():
    save_dir = Path("backend/uploads/avatars")
    count = 0
    if save_dir.exists():
        count = len([f for f in save_dir.iterdir() if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]])
    return {"count": count}

@router.delete("/profile/avatars")
async def api_clear_profile_avatars():
    save_dir = Path("backend/uploads/avatars")
    if save_dir.exists():
        for f in save_dir.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass
    return {"status": "ok"}

@router.post("/scraper/start")
async def api_start_scraper(req: ScraperRequest):
    task_id = f"scrape_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="scraper",
        title=f"Парсинг чата {req.chat_username_or_link}",
        total=req.max_count,
        account_phones=[req.account_phone],
        config=req.model_dump()
    )
    
    asyncio.create_task(run_chat_scraper(
        task_id=task_id,
        account_phone=req.account_phone,
        chat_username_or_link=req.chat_username_or_link,
        only_active=req.only_active,
        only_with_username=req.only_with_username,
        max_count=req.max_count
    ))
    return {"status": "ok", "task_id": task_id}

@router.post("/sender/start")
async def api_start_sender(req: SenderRequest):
    if not req.account_phones or not req.targets:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты или список получателей")
        
    task_id = f"send_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="mass_sender",
        title=f"Рассылка по {len(req.targets)} лидам",
        total=len(req.targets),
        account_phones=req.account_phones,
        config=req.model_dump()
    )
    
    asyncio.create_task(run_mass_sender(
        task_id=task_id,
        account_phones=req.account_phones,
        targets=req.targets,
        message_template=req.message_template,
        min_delay=req.min_delay,
        max_delay=req.max_delay
    ))
    return {"status": "ok", "task_id": task_id}

@router.post("/profile/update")
async def api_batch_profile_update(req: ProfileUpdateRequest):
    if not req.account_phones:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты")
        
    task_id = f"prof_{uuid.uuid4().hex[:6]}"
    await task_engine.register_task(
        task_id=task_id,
        task_type="profile_update",
        title=f"Настройка профилей ({len(req.account_phones)} акк.)",
        total=len(req.account_phones),
        account_phones=req.account_phones,
        config=req.model_dump()
    )
    
    asyncio.create_task(run_batch_profile_update(
        task_id=task_id,
        account_phones=req.account_phones,
        first_name=req.first_name,
        last_name=req.last_name,
        bio=req.bio,
        set_username=req.set_username,
        set_avatar=req.set_avatar,
        enable_2fa=req.enable_2fa,
        two_fa_password=req.two_fa_password,
        two_fa_hint=req.two_fa_hint,
        hide_phone=req.hide_phone,
        hide_search_by_phone=req.hide_search_by_phone,
        hide_last_seen=req.hide_last_seen,
        block_calls=req.block_calls,
        block_p2p=req.block_p2p,
        block_invites=req.block_invites
    ))
    return {"status": "ok", "task_id": task_id}
