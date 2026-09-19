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
from pathlib import Path
from typing import Dict, Tuple, List
from urllib.parse import quote
from fastapi.responses import FileResponse, JSONResponse
from app.core.config import AVATARS_DIR
from app.telegram.client_manager import client_manager
from app.telegram.mtproto_limiter import avatar_limiter
from app.core.logger import logger

_avatar_negative_cache: Dict[Tuple[str, int], float] = {}
_AVATAR_NEGATIVE_TTL = 600.0
_AVATAR_NEGATIVE_MAX = 20000
_avatar_in_flight: Dict[Tuple[str, int], asyncio.Future] = {}

_AVATAR_CACHE_HEADERS = {"Cache-Control": "public, max-age=604800, immutable"}


def _avatar_key(account: str, chat_id: int) -> Tuple[str, int]:
    return re.sub(r'[^a-zA-Z0-9_-]', '_', str(account)), chat_id


def _avatar_file(account: str, chat_id: int) -> Path:
    safe_acc, cid = _avatar_key(account, chat_id)
    return AVATARS_DIR / f"{safe_acc}_{cid}.jpg"


def _avatar_url(account: str, chat_id: int) -> str:
    return f"/api/avatar?account={quote(str(account))}&chat_id={chat_id}"


def _avatar_on_disk(avatar_file: Path) -> bool:
    try:
        return avatar_file.exists() and avatar_file.stat().st_size > 0
    except OSError:
        return False


def _mark_avatar_negative(cache_key: Tuple[str, int]) -> None:
    now = time.time()
    _avatar_negative_cache[cache_key] = now
    if len(_avatar_negative_cache) > _AVATAR_NEGATIVE_MAX:
        for key, ts in list(_avatar_negative_cache.items()):
            if (now - ts) > _AVATAR_NEGATIVE_TTL:
                _avatar_negative_cache.pop(key, None)


async def _download_avatar(account: str, chat_id: int) -> bool:
    """
    Гарантирует наличие аватарки на диске.
    Дедуплицирует параллельные запросы и ограничивает MTProto через avatar_limiter
    (раньше здесь стоял общий Semaphore(2), из-за которого 200 аватарок грузились минутами).
    """
    avatar_file = _avatar_file(account, chat_id)
    if _avatar_on_disk(avatar_file):
        return True

    cache_key = _avatar_key(account, chat_id)
    now = time.time()
    neg_ts = _avatar_negative_cache.get(cache_key)
    if neg_ts and (now - neg_ts) < _AVATAR_NEGATIVE_TTL:
        return False

    client = client_manager.get_client(account)
    if not client or not client.is_connected():
        _mark_avatar_negative(cache_key)
        return False

    # Дедупликация параллельных запросов на одну и ту же аватарку
    existing = _avatar_in_flight.get(cache_key)
    if existing is not None:
        try:
            await asyncio.wait_for(asyncio.shield(existing), timeout=10.0)
        except Exception:
            pass
        return _avatar_on_disk(avatar_file)

    loop = asyncio.get_running_loop()
    fut = loop.create_future()
    _avatar_in_flight[cache_key] = fut

    operation_failed = False
    try:
        async with avatar_limiter.slot(account):
            if str(chat_id) in (str(account), "0", "-1"):
                downloaded = await asyncio.wait_for(
                    client.download_profile_photo("me", file=str(avatar_file)), timeout=20.0
                )
            else:
                try:
                    entity = await asyncio.wait_for(client.get_input_entity(chat_id), timeout=6.0)
                except Exception:
                    try:
                        entity = await asyncio.wait_for(client.get_entity(chat_id), timeout=6.0)
                    except Exception:
                        entity = chat_id
                downloaded = await asyncio.wait_for(
                    client.download_profile_photo(entity, file=str(avatar_file)), timeout=20.0
                )
    except asyncio.CancelledError:
        operation_failed = True
        raise
    except Exception as e:
        operation_failed = True
        logger.debug(f"Avatar download error for {chat_id}: {e}")
    finally:
        # Чистим битый (недокачанный / 0-байтовый) файл, чтобы не блокировал повторный кач
        if avatar_file.exists():
            try:
                if avatar_file.stat().st_size == 0:
                    avatar_file.unlink()
            except OSError:
                pass
        if not fut.done():
            fut.set_result(False)
        _avatar_in_flight.pop(cache_key, None)

    if _avatar_on_disk(avatar_file):
        return True

    # Временный сбой (таймаут/сеть/прерывание) НЕ заносим в негативный кэш — иначе
    # аватарка «мертва» на 10 минут, хотя следующая попытка легко может пройти.
    if operation_failed:
        return False

    # Стабильный исход: фото действительно нет / клиент недоступен — кэшируем надолго.
    _mark_avatar_negative(cache_key)
    return False


@router.get("/avatar")
async def api_get_avatar(account: str, chat_id: int):
    """
    Возвращает кэшированную аватарку или скачивает её из Telegram через Telethon.
    Использует строгий негативный кэш (10 мин) и общий MTProto-лимитер.
    """
    avatar_file = _avatar_file(account, chat_id)

    if _avatar_on_disk(avatar_file):
        return FileResponse(avatar_file, media_type="image/jpeg", headers=_AVATAR_CACHE_HEADERS)

    if await _download_avatar(account, chat_id):
        return FileResponse(avatar_file, media_type="image/jpeg", headers=_AVATAR_CACHE_HEADERS)

    return JSONResponse({"error": "Аватарка отсутствует"}, status_code=404)


def _parse_avatar_items(items: str, limit: int = 60) -> List[Tuple[str, int]]:
    parsed: List[Tuple[str, int]] = []
    seen = set()
    for chunk in (items or "").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        account, _, raw_chat_id = chunk.rpartition(":")
        if not account:
            continue
        try:
            chat_id = int(raw_chat_id)
        except ValueError:
            continue
        key = (account, chat_id)
        if key in seen:
            continue
        seen.add(key)
        parsed.append(key)
        if len(parsed) >= limit:
            break
    return parsed


@router.get("/avatars")
async def api_get_avatars_bulk(items: str = Query(""), download: int = Query(16)):
    """
    Пакетный резолвер аватарок для видимого окна списка диалогов.

    Заменяет собой N отдельных запросов `/api/avatar` от каждой строки списка:
    браузер держит всего ~6 HTTP/1.1 соединений на origin, и раньше они все были
    заняты медленными загрузками аватарок — из-за этого «не грузились диалоги».

    Ответ:
      found   — { "<account>_<chat_id>": "<url>" } для тех, что реально есть;
      failed  — список ключей, для которых аватарки точно нет (негативный кэш);
      skipped — список ключей, которые не успели обработать из-за бюджета `download`.
                Фронтенд повторит запрос позже — так аватарки догружаются прогрессивно.
    """
    parsed = _parse_avatar_items(items)
    if not parsed:
        return {"found": {}, "failed": [], "skipped": []}

    budget = max(0, min(int(download), len(parsed)))
    found: Dict[str, str] = {}
    failed: List[str] = []
    skipped: List[str] = []
    to_fetch: List[Tuple[str, int]] = []

    for account, chat_id in parsed:
        key = f"{account}_{chat_id}"
        if _avatar_on_disk(_avatar_file(account, chat_id)):
            found[key] = _avatar_url(account, chat_id)
        elif len(to_fetch) < budget:
            to_fetch.append((account, chat_id))
        else:
            skipped.append(key)

    if to_fetch:
        gate = asyncio.Semaphore(8)

        async def resolve(account: str, chat_id: int):
            async with gate:
                try:
                    ok = await asyncio.wait_for(_download_avatar(account, chat_id), timeout=25.0)
                except Exception:
                    ok = False
            return account, chat_id, ok

        results = await asyncio.gather(*[resolve(a, c) for a, c in to_fetch])
        for account, chat_id, ok in results:
            key = f"{account}_{chat_id}"
            if ok:
                found[key] = _avatar_url(account, chat_id)
            else:
                failed.append(key)

    return {"found": found, "failed": failed, "skipped": skipped}
