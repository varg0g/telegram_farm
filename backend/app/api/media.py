import os
import re
import time
import asyncio
from pathlib import Path
from typing import Optional, Dict, Tuple
from fastapi import APIRouter, HTTPException, Request, Response, Query
from fastapi.responses import FileResponse, JSONResponse
from app.core.config import MEDIA_DIR
from app.core.logger import logger
from app.telegram.client_manager import client_manager
from app.telegram.mtproto_limiter import media_limiter
from app.db.database import db

router = APIRouter(prefix="/api/media", tags=["media"])

def _sanitize(val: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_-]', '_', str(val))

_download_locks: Dict[str, asyncio.Lock] = {}
_media_negative_cache: Dict[str, float] = {}
_NEGATIVE_CACHE_TTL = 600.0
_NEGATIVE_CACHE_MAX = 20000

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

# ==================== ИНДЕКС МЕДИАФАЙЛОВ ====================
# Раньше поиск файла делался через MEDIA_DIR.glob() прямо в event loop — на каталоге
# в десятки тысяч файлов это блокировало весь сервер на ~20 мс на каждый вызов,
# а вызывался он до 3 раз на один медиазапрос. Теперь каталог сканируется один раз
# на старте (в отдельном потоке), а поиск — это O(1) обращение к словарю.

_media_index: Dict[str, Path] = {}                      # stem -> путь к файлу
_media_peer_index: Dict[Tuple[int, int], Path] = {}     # (chat_id, message_id) -> путь к файлу
_media_index_ready = False
_media_index_lock = asyncio.Lock()


def _parse_media_stem(stem: str) -> Optional[Tuple[int, int, bool]]:
    """
    Разбирает имя файла вида `{account}_{chat_id}_{message_id}[_thumb]`.
    Возвращает (chat_id, message_id, is_thumb) либо None, если имя не по шаблону.
    """
    parts = stem.split("_")
    if len(parts) < 3:
        return None
    if parts[-1] == "thumb":
        if len(parts) < 4:
            return None
        try:
            return int(parts[-3]), int(parts[-2]), True
        except ValueError:
            return None
    try:
        return int(parts[-2]), int(parts[-1]), False
    except ValueError:
        return None


def _is_readable_file(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def _scan_media_dir() -> Tuple[Dict[str, Path], Dict[Tuple[int, int], Path]]:
    """Однократный обход каталога медиа. Выполняется в отдельном потоке."""
    index: Dict[str, Path] = {}
    peer_index: Dict[Tuple[int, int], Path] = {}
    try:
        with os.scandir(MEDIA_DIR) as entries:
            for entry in entries:
                name = entry.name
                if name.startswith(".") or "_" not in name:
                    continue
                try:
                    if not entry.is_file():
                        continue
                except OSError:
                    continue
                stem = name.rsplit(".", 1)[0]
                path = Path(entry.path)
                index[stem] = path
                parsed = _parse_media_stem(stem)
                if parsed and not parsed[2]:
                    peer_index.setdefault((parsed[0], parsed[1]), path)
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.warning(f"Не удалось построить индекс медиа: {e}")
    return index, peer_index


async def ensure_media_index(force: bool = False) -> None:
    """Гарантирует готовность индекса. Вызывается на старте приложения."""
    global _media_index_ready
    if _media_index_ready and not force:
        return
    async with _media_index_lock:
        if _media_index_ready and not force:
            return
        index, peer_index = await asyncio.to_thread(_scan_media_dir)
        _media_index.clear()
        _media_index.update(index)
        _media_peer_index.clear()
        _media_peer_index.update(peer_index)
        _media_index_ready = True
        logger.info(f"Индекс медиа готов: {len(_media_index)} файлов в кэше")


def register_cached_media(path: Path):
    """Регистрирует новый файл в индексе (после скачивания или отправки)."""
    if not path:
        return
    try:
        if not _is_readable_file(path):
            return
    except OSError:
        return
    stem = path.stem
    _media_index[stem] = path
    parsed = _parse_media_stem(stem)
    if parsed and not parsed[2]:
        _media_peer_index.setdefault((parsed[0], parsed[1]), path)


def find_cached_media(account_phone: str, chat_id: int, message_id: int, thumb: bool = False) -> Optional[Path]:
    """Поиск файла в локальном кэше: только словарные обращения, без дискового I/O."""
    clean_acc = account_phone.strip().lstrip("+")
    safe_clean = _sanitize(clean_acc)
    safe_raw = _sanitize(account_phone.strip())

    stems_to_try = []
    for prefix in [safe_clean, safe_raw]:
        if thumb:
            stems_to_try.append(f"{prefix}_{chat_id}_{message_id}_thumb")
        stems_to_try.append(f"{prefix}_{chat_id}_{message_id}")

    for stem in stems_to_try:
        cached = _media_index.get(stem)
        if cached is None:
            continue
        if _is_readable_file(cached):
            return cached
        _media_index.pop(stem, None)

    # Fallback: тот же chat_id/message_id, но другое написание аккаунта
    peer_cached = _media_peer_index.get((chat_id, message_id))
    if peer_cached and _is_readable_file(peer_cached):
        return peer_cached

    return None

def _mark_negative(lock_key: str) -> None:
    """Помечает медиа как отсутствующее, попутно подчищая разросшийся кэш."""
    now = time.time()
    _media_negative_cache[lock_key] = now
    if len(_media_negative_cache) > _NEGATIVE_CACHE_MAX:
        for key, ts in list(_media_negative_cache.items()):
            if (now - ts) > _NEGATIVE_CACHE_TTL:
                _media_negative_cache.pop(key, None)


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
    if neg_ts and (now - neg_ts) < _NEGATIVE_CACHE_TTL:
        return None

    if lock_key not in _download_locks:
        _download_locks[lock_key] = asyncio.Lock()

    async with _download_locks[lock_key]:
        # Повторная проверка кэша после входа в лок
        cached = find_cached_media(account_phone, chat_id, message_id, thumb=thumb)
        if cached:
            return cached

        neg_ts = _media_negative_cache.get(lock_key)
        if neg_ts and (time.time() - neg_ts) < _NEGATIVE_CACHE_TTL:
            return None

        client = client_manager.get_client(clean_acc)
        if not client or not client.is_connected():
            return None

        async with media_limiter.slot(clean_acc):
            try:
                msg = None
                try:
                    msg = await asyncio.wait_for(client.get_messages(chat_id, ids=message_id), timeout=2.0)
                except Exception:
                    try:
                        entity = await asyncio.wait_for(client.get_input_entity(chat_id), timeout=1.5)
                        msg = await asyncio.wait_for(client.get_messages(entity, ids=message_id), timeout=2.0)
                    except Exception:
                        _mark_negative(lock_key)
                        return None

                if not msg or not msg.media:
                    _mark_negative(lock_key)
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

                _mark_negative(lock_key)
            except Exception as e:
                logger.debug(f"Media download failed {chat_id}/{message_id}: {e}")
                _mark_negative(lock_key)
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
