import os
import re
import time
import asyncio
from pathlib import Path
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, Request, Response, Query
from fastapi.responses import FileResponse, JSONResponse
from app.core.config import MEDIA_DIR
from app.core.logger import logger
from app.telegram.client_manager import client_manager
from app.db.database import db

router = APIRouter(prefix="/api/media", tags=["media"])

def _sanitize(val: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_-]', '_', str(val))

_download_locks: Dict[str, asyncio.Lock] = {}
_media_negative_cache: Dict[str, float] = {}
_media_semaphore = asyncio.Semaphore(2)

def _get_media_type_by_ext(ext: str) -> str:
    ext = ext.lower()
    if ext in (".mp4", ".mov", ".m4v"):
        return "video/mp4"
    elif ext in (".webm",):
        return "video/webm"
    elif ext in (".ogg", ".oga", ".opus"):
        return "audio/ogg"
    elif ext in (".mp3",):
        return "audio/mpeg"
    elif ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    elif ext in (".png",):
        return "image/png"
    elif ext in (".webp",):
        return "image/webp"
    elif ext in (".gif",):
        return "image/gif"
    return "application/octet-stream"

_media_path_cache: Dict[str, Path] = {}

def register_cached_media(path: Path):
    """Регистрирует новый файл в быстром in-memory кэше."""
    if path and path.is_file() and path.stat().st_size > 0:
        stem = path.stem
        _media_path_cache[stem] = path

def find_cached_media(account_phone: str, chat_id: int, message_id: int, thumb: bool = False) -> Optional[Path]:
    """Быстрый поиск существующего файла в локальном кэше (память < 0.001 мс, диск как fallback)."""
    clean_acc = account_phone.strip().lstrip("+")
    safe_clean = _sanitize(clean_acc)
    safe_raw = _sanitize(account_phone.strip())

    # 1. Проверка точного совпадения по аккаунту
    stems_to_try = []
    for prefix in [safe_clean, safe_raw]:
        if thumb:
            stems_to_try.append(f"{prefix}_{chat_id}_{message_id}_thumb")
        stems_to_try.append(f"{prefix}_{chat_id}_{message_id}")

    for stem in stems_to_try:
        if stem in _media_path_cache:
            p = _media_path_cache[stem]
            if p.is_file() and p.stat().st_size > 0:
                return p
            else:
                _media_path_cache.pop(stem, None)

        pattern = f"{stem}.*"
        for existing in MEDIA_DIR.glob(pattern):
            if existing.is_file() and existing.stat().st_size > 0:
                _media_path_cache[stem] = existing
                return existing

    # 2. Fallback: поиск по chat_id и message_id независимо от аккаунта фермы
    global_patterns = []
    if thumb:
        global_patterns.append(f"*_{chat_id}_{message_id}_thumb.*")
    global_patterns.append(f"*_{chat_id}_{message_id}.*")
    for pat in global_patterns:
        for existing in MEDIA_DIR.glob(pat):
            if existing.is_file() and existing.stat().st_size > 0:
                _media_path_cache[existing.stem] = existing
                return existing

    return None

async def download_media_to_file(account_phone: str, chat_id: int, message_id: int, thumb: bool = False) -> Optional[Path]:
    """
    Скачивает медиа через Telethon с ограничением параллелизма и дедупликацией.
    Для thumb=True скачивает сверхлегкое превью (5-15 KB) за десятки миллисекунд.
    """
    cached = find_cached_media(account_phone, chat_id, message_id, thumb=thumb)
    if cached:
        return cached

    clean_acc = account_phone.strip().lstrip("+")
    safe_clean = _sanitize(clean_acc)
    lock_key = f"{safe_clean}_{chat_id}_{message_id}{'_thumb' if thumb else ''}"
    now = time.time()
    neg_ts = _media_negative_cache.get(lock_key)
    if neg_ts and (now - neg_ts) < 600:
        return None

    if lock_key not in _download_locks:
        _download_locks[lock_key] = asyncio.Lock()

    async with _download_locks[lock_key]:
        # Повторная проверка кэша после входа в лок
        cached = find_cached_media(account_phone, chat_id, message_id, thumb=thumb)
        if cached:
            return cached

        neg_ts = _media_negative_cache.get(lock_key)
        if neg_ts and (time.time() - neg_ts) < 600:
            return None

        client = client_manager.get_client(clean_acc)
        if not client or not client.is_connected():
            return None

        async with _media_semaphore:
            try:
                msg = None
                try:
                    msg = await asyncio.wait_for(client.get_messages(chat_id, ids=message_id), timeout=2.0)
                except Exception:
                    try:
                        entity = await asyncio.wait_for(client.get_input_entity(chat_id), timeout=1.5)
                        msg = await asyncio.wait_for(client.get_messages(entity, ids=message_id), timeout=2.0)
                    except Exception:
                        _media_negative_cache[lock_key] = time.time()
                        return None

                if not msg or not msg.media:
                    _media_negative_cache[lock_key] = time.time()
                    return None

                if thumb:
                    target_file = MEDIA_DIR / f"{safe_clean}_{chat_id}_{message_id}_thumb.jpg"
                    downloaded = None
                    try:
                        downloaded = await asyncio.wait_for(
                            client.download_media(msg, file=str(target_file), thumb=-1),
                            timeout=3.0
                        )
                    except Exception:
                        pass

                    if not downloaded or not target_file.exists() or target_file.stat().st_size == 0:
                        is_small = bool(getattr(msg, "photo", False) or getattr(msg, "sticker", False) or (getattr(msg, "file", None) and getattr(msg.file, "size", 0) <= 2 * 1024 * 1024))
                        if is_small:
                            try:
                                downloaded = await asyncio.wait_for(
                                    client.download_media(msg, file=str(target_file)),
                                    timeout=3.0
                                )
                            except Exception:
                                pass
                else:
                    ext = ".bin"
                    if msg.video_note:
                        ext = ".mp4"
                    elif msg.voice:
                        ext = ".ogg"
                    elif msg.photo:
                        ext = ".jpg"
                    elif msg.video:
                        ext = ".mp4"
                    elif msg.audio:
                        ext = ".mp3"
                    elif msg.sticker:
                        ext = ".webp"
                    elif getattr(msg, "file", None) and getattr(msg.file, "ext", None):
                        ext = msg.file.ext
                    elif getattr(msg, "file", None) and getattr(msg.file, "name", None):
                        ext = Path(msg.file.name).suffix or ".bin"

                    target_file = MEDIA_DIR / f"{safe_clean}_{chat_id}_{message_id}{ext}"
                    downloaded = await asyncio.wait_for(
                        client.download_media(msg, file=str(target_file)),
                        timeout=12.0
                    )

                if downloaded:
                    final_path = Path(downloaded)
                    if final_path.exists() and final_path.stat().st_size > 0:
                        register_cached_media(final_path)
                        return final_path

                if target_file.exists() and target_file.stat().st_size > 0:
                    register_cached_media(target_file)
                    return target_file

                _media_negative_cache[lock_key] = time.time()
            except Exception as e:
                logger.debug(f"Media download failed {chat_id}/{message_id}: {e}")
                _media_negative_cache[lock_key] = time.time()
                return None

    return None

async def prefetch_media(account_phone: str, chat_id: int, message_id: int):
    """Фоновая предзагрузка медиафайла без блокировки вызова."""
    try:
        await download_media_to_file(account_phone, chat_id, message_id)
    except Exception as e:
        logger.debug(f"Prefetch error for {chat_id}/{message_id}: {e}")

@router.api_route("/{account_phone}/{chat_id}/{message_id}", methods=["GET", "HEAD"])
async def get_media_file(
    request: Request,
    account_phone: str,
    chat_id: int,
    message_id: int,
    thumb: Optional[int] = Query(None)
):
    """
    Стриминг медиа (кружочки video_note, голосовые voice, фото, видео, документы).
    Поддерживает Range-запросы (206) и микро-превью (thumb=1) для мгновенного рендеринга.
    Автоматически корректирует переданный ID, если был отправлен локальный ID строки SQLite.
    """
    is_thumb = bool(thumb)

    # 1. Проверяем кэш на диске по переданному message_id
    existing = find_cached_media(account_phone, chat_id, message_id, thumb=is_thumb)

    # 2. Если в кэше нет — инициируем скачивание
    if not existing:
        existing = await download_media_to_file(account_phone, chat_id, message_id, thumb=is_thumb)

    # 3. Защитная автокоррекция: если файл не найден, возможно передан локальный row ID из базы SQLite
    if not existing:
        try:
            row = await db.fetch_one(
                "SELECT message_id FROM messages WHERE id = ? AND chat_id = ?",
                (message_id, chat_id)
            )
            if row and row.get("message_id") and row["message_id"] != message_id:
                real_id = row["message_id"]
                existing = find_cached_media(account_phone, chat_id, real_id, thumb=is_thumb)
                if not existing:
                    existing = await download_media_to_file(account_phone, chat_id, real_id, thumb=is_thumb)
        except Exception as e_db:
            logger.debug(f"Auto-correction lookup error: {e_db}")

    if not existing or not existing.exists() or existing.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="Медиафайл не найден")

    media_type = _get_media_type_by_ext(existing.suffix)
    file_size = existing.stat().st_size

    # Обработка HEAD запроса браузера
    if request.method == "HEAD":
        return Response(
            status_code=200,
            headers={
                "Content-Type": media_type,
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=604800, immutable"
            }
        )

    # Отдача файла с поддержкой Range-запросов (206)
    return FileResponse(
        existing,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=604800, immutable"
        }
    )
