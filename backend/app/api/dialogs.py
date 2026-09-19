from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from app.core.security import get_current_admin
from app.services.chat_service import get_dialogs_list, mark_dialog_read, get_dialog_media

router = APIRouter(prefix="/api/dialogs", tags=["dialogs"], dependencies=[Depends(get_current_admin)])

@router.get("")
async def api_get_dialogs(
    account_phone: Optional[str] = None,
    group_id: Optional[int] = None,
    chat_type: Optional[str] = "all",
    search: Optional[str] = None
):
    """
    Возвращает список диалогов из локальной БД за 2–3 мс.
    """
    return await get_dialogs_list(
        account_phone=account_phone,
        group_id=group_id,
        chat_type=chat_type,
        search=search
    )

@router.get("/{account_phone}/{chat_id}/media")
async def api_get_media(
    account_phone: str,
    chat_id: int,
    kind: str = Query("media"),
    limit: int = Query(50, ge=1, le=100)
):
    """Возвращает медиа-файлы чата (вкладки медиа, файлы, голос, ссылки)."""
    return await get_dialog_media(account_phone, chat_id, kind=kind, limit=limit)

@router.post("/{account_phone}/{chat_id}/read")
async def api_mark_read(account_phone: str, chat_id: int):
    """Сбрасывает счетчик непрочитанных сообщений в чате."""
    await mark_dialog_read(account_phone, chat_id)
    return {"status": "ok"}

import re
import time
import asyncio
from typing import Dict, Tuple
from fastapi.responses import FileResponse, JSONResponse
from app.core.config import AVATARS_DIR
from app.telegram.client_manager import client_manager
from app.core.logger import logger

_avatar_negative_cache: Dict[Tuple[str, int], float] = {}
_avatar_semaphore = asyncio.Semaphore(2)
_avatar_in_flight: Dict[Tuple[str, int], asyncio.Future] = {}

@router.get("/avatar")
async def api_get_avatar(account: str, chat_id: int):
    """
    Возвращает кэшированную аватарку или скачивает её из Telegram через Telethon.
    Использует строгий негативный кэш (10 мин) и семафор, исключая MTProto перегрузку.
    """
    safe_acc = re.sub(r'[^a-zA-Z0-9_-]', '_', str(account))
    avatar_file = AVATARS_DIR / f"{safe_acc}_{chat_id}.jpg"
    
    # 1. Если файл уже на диске — моментальный ответ
    if avatar_file.exists() and avatar_file.stat().st_size > 0:
        return FileResponse(
            avatar_file,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"}
        )

    # 2. Проверка негативного кэша (если ранее выяснили, что у пользователя нет фото)
    cache_key = (safe_acc, chat_id)
    now = time.time()
    neg_ts = _avatar_negative_cache.get(cache_key)
    if neg_ts and (now - neg_ts) < 600:
        return JSONResponse({"error": "Аватарка отсутствует"}, status_code=404)
        
    client = client_manager.get_client(account)
    if not client or not client.is_connected():
        _avatar_negative_cache[cache_key] = now
        return JSONResponse({"error": "Клиент не подключен"}, status_code=404)

    # 3. Дедупликация параллельных запросов на один и тот же аватар
    if cache_key in _avatar_in_flight:
        try:
            await _avatar_in_flight[cache_key]
        except Exception:
            pass
        if avatar_file.exists() and avatar_file.stat().st_size > 0:
            return FileResponse(
                avatar_file,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=604800, immutable"}
            )
        return JSONResponse({"error": "Аватарка отсутствует"}, status_code=404)

    loop = asyncio.get_running_loop()
    fut = loop.create_future()
    _avatar_in_flight[cache_key] = fut

    try:
        async with _avatar_semaphore:
            # Если аватарка самого аккаунта
            if str(chat_id) in (str(account), "0", "-1"):
                downloaded = await asyncio.wait_for(client.download_profile_photo("me", file=str(avatar_file)), timeout=2.0)
            else:
                try:
                    entity = await asyncio.wait_for(client.get_input_entity(chat_id), timeout=1.5)
                except Exception:
                    try:
                        entity = await asyncio.wait_for(client.get_entity(chat_id), timeout=1.5)
                    except Exception:
                        entity = chat_id
                downloaded = await asyncio.wait_for(client.download_profile_photo(entity, file=str(avatar_file)), timeout=2.0)
                
            if downloaded and avatar_file.exists() and avatar_file.stat().st_size > 0:
                if not fut.done(): fut.set_result(True)
                return FileResponse(
                    avatar_file,
                    media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=604800, immutable"}
                )
    except Exception as e:
        logger.debug(f"Avatar download error for {chat_id}: {e}")
    finally:
        if not fut.done(): fut.set_result(False)
        _avatar_in_flight.pop(cache_key, None)

    # Помечаем в негативном кэше, чтобы больше не долбить сокет Telegram
    _avatar_negative_cache[cache_key] = time.time()
    return JSONResponse({"error": "Аватарка отсутствует"}, status_code=404)
