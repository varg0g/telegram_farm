import os
import io
import time
import json
import re
import mimetypes
import aiosqlite
import asyncio
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
import secrets
import hashlib
from database import init_db, get_db
from pathlib import Path
from render import _chat_subtitle, _media_label, _render_album_html, _render_message_html
from html import escape
from urllib.parse import quote
from datetime import datetime, timedelta, timezone
from utils import (
    get_current_user, check_rate_limit, accounts_cache, verify_csrf,
    ADMIN_PASSWORD_HASH, SESSION_COOKIE_NAME, CSRF_COOKIE_NAME,
    _config, BASE_DIR, SESSIONS_DIR, clients, clients_lock, dialog_caches,
    dialog_locks, _get_client, API_ID, API_HASH, make_client,
    pending_clients, _sync_accounts, get_random_profile, parse_proxy_string,
    delete_session_files, start_single_client, format_raw_user_status
)
from logger import logger
from auth import auth_router
from contextlib import asynccontextmanager
from collections import OrderedDict
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, Response, Request, Cookie, HTTPException, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pyrogram import Client
from pyrogram import raw, utils as p_utils

# Лимиты для больших ферм (1000+ аккаунтов).
DIALOG_CAP = 9999
ACCOUNT_PAGE_HINT = 300

# --- Списки и кэши -------------------------------------------------------------
pending_clients = {}         # phone -> auth data (с TTL)
pending_ttl = 300            # 5 минут TTL для pending_clients
group_cache = OrderedDict()  # (account, chat_id) -> bool (групповой ли чат), LRU
GROUP_CACHE_LIMIT = 4000

# Постоянный дисковый кэш медиа и аватарок в data/ (молниеносная отдача за < 1мс)
MEDIA_DIR = BASE_DIR / "data" / "media_cache"
AVATAR_DIR = BASE_DIR / "data" / "avatar_cache"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

AVATAR_LOCKS = {}
MEDIA_LOCKS = {}

MEDIA_KINDS = {"photo", "voice", "video", "video_note", "animation", "sticker", "audio", "document", "web_page"}

# Видео/гифки качаем только по клику. Защита от злоупотребления памятью:
MAX_VIDEO_BYTES = 400 * 1024 * 1024          # крупнее — отдаём 404 (не тянем в память)
MAX_CACHE_ITEM_BYTES = 64 * 1024 * 1024      # больше этого не кладём в LRU-кэш (не выбивает остальное)

RENDERED_MESSAGES_CACHE = OrderedDict()
RENDERED_MESSAGES_TTL = 60.0
RENDERED_MESSAGES_LIMIT = 300

def _get_cached_messages(account, chat_id, limit):
    key = (account, chat_id, limit)
    item = RENDERED_MESSAGES_CACHE.get(key)
    if item is not None:
        if time.monotonic() - item["ts"] < RENDERED_MESSAGES_TTL:
            RENDERED_MESSAGES_CACHE.move_to_end(key)
            return item["html"], item["read_max"]
        else:
            RENDERED_MESSAGES_CACHE.pop(key, None)
    return None

def _put_cached_messages(account, chat_id, limit, html, read_max):
    key = (account, chat_id, limit)
    RENDERED_MESSAGES_CACHE[key] = {"html": html, "read_max": read_max, "ts": time.monotonic()}
    while len(RENDERED_MESSAGES_CACHE) > RENDERED_MESSAGES_LIMIT:
        RENDERED_MESSAGES_CACHE.popitem(last=False)

async def _cleanup_pending_clients():
    now = time.monotonic()
    expired = [phone for phone, data in list(pending_clients.items()) if now - data.get("created_at", now) > pending_ttl]
    for phone in expired:
        data = pending_clients.pop(phone, None)
        if data and data.get("client"):
            try:
                if data["client"].is_connected:
                    await data["client"].disconnect()
            except Exception:
                pass

async def _pending_reaper_task():
    while True:
        await asyncio.sleep(60)
        try:
            await _cleanup_pending_clients()
        except Exception:
            pass

def _avatar_color(seed):
    return abs(seed) % 8

def _dialog_dict(d):
    chat = d.chat
    title = chat.title or chat.first_name or "Без названия"
    top = d.top_message
    author_name = None
    is_outgoing = False
    out_status = None
    if top:
        preview = top.text if top.text else _media_label(top)
        is_outgoing = bool(getattr(top, "outgoing", False))
        if is_outgoing:
            read_max = getattr(d, 'read_outbox_max_id', 0)
            if read_max and read_max >= top.id:
                out_status = "read"
            else:
                out_status = "sent"
        else:
            from_user = getattr(top, "from_user", None)
            if from_user and getattr(chat, "type", None) in ("group", "supergroup"):
                author_name = getattr(from_user, "first_name", "") or getattr(from_user, "username", "")
        ts = int(top.date.timestamp()) if hasattr(top.date, 'timestamp') else int(top.date)
    else:
        preview = "Нет сообщений"
        ts = 0
    return {
        "id": chat.id,
        "title": title,
        "type": chat.type,
        "unread": d.unread_messages_count or 0,
        "preview": preview[:120],
        "ts": ts,
        "color": _avatar_color(chat.id),
        "muted": bool(getattr(d, "is_muted", False)),
        "is_outgoing": is_outgoing,
        "out_status": out_status,
        "author_name": author_name,
        "message_id": top.id if top else 0,
    }

async def _ensure_peers(client):
    """Сохраняет пиров диалогов в сессионную БД.

    Pyrogram 2.0.106 в get_dialogs() не вызывает fetch_peers, поэтому resolve_peer
    для любого чата падает с PeerIdInvalid. Этот хелпер тянет сырые диалоги и
    сохраняет users/chats в storage.
    """
    if getattr(client, "_peers_loaded", False):
        return
    try:
        offset_date = 0
        offset_id = 0
        offset_peer = raw.types.InputPeerEmpty()
        for _ in range(1):
            r = await client.invoke(
                raw.functions.messages.GetDialogs(
                    offset_date=offset_date,
                    offset_id=offset_id,
                    offset_peer=offset_peer,
                    limit=100,
                    hash=0,
                ),
                sleep_threshold=5,
            )
            await client.fetch_peers(list(r.users) + list(r.chats))
            dialogs = [d for d in r.dialogs if isinstance(d, raw.types.Dialog)]
            if not dialogs or len(dialogs) < 100:
                break
            last = dialogs[-1]
            offset_id = last.top_message.id
            offset_date = last.top_message.date
            offset_peer = await client.resolve_peer(p_utils.get_peer_id(last.peer))
    except Exception:
        pass
    finally:
        client._peers_loaded = True

async def _load_dialogs(client):
    """Load dialogs using raw API to get fresh data."""
    items = []
    seen_dialog_ids = set()
    from pyrogram.raw.functions.messages import GetDialogs
    from pyrogram.raw.types import InputPeerEmpty, PeerUser, PeerChat, PeerChannel
    from pyrogram.utils import parse_messages, get_peer_id
    import pyrogram
    
    offset_date = 0
    offset_id = 0
    offset_peer = InputPeerEmpty()
    
    try:
        for _ in range(2):
            r = await client.invoke(
                GetDialogs(
                    offset_date=offset_date,
                    offset_id=offset_id,
                    offset_peer=offset_peer,
                    limit=100,
                    hash=0,
                ),
                sleep_threshold=60,
            )
            
            await client.fetch_peers(list(r.users) + list(r.chats))
            
            parsed_messages = await parse_messages(client, r, replies=0)
            chat_to_msg = {}
            for m in parsed_messages:
                if m.chat:
                    existing = chat_to_msg.get(m.chat.id)
                    if not existing or m.id > existing.id:
                        chat_to_msg[m.chat.id] = m
            
            users_dict = {u.id: u for u in r.users}
            chats_dict = {c.id: c for c in r.chats}
            
            dialogs = [d for d in r.dialogs if getattr(d, 'peer', None)]
            if not dialogs:
                break
                
            for d in dialogs:
                peer = d.peer
                
                title = "Без имени"
                chat_id = 0
                chat_type = ""
                user_status_text = "диалог"
                user_online = False
                user_username = ""
                user_phone = ""
                
                if isinstance(peer, PeerUser):
                    u = users_dict.get(peer.user_id)
                    if u:
                        chat_id = u.id
                        is_self = getattr(u, 'self', False) or (client.me and client.me.id == u.id)
                        if is_self:
                            title = "Избранное"
                            chat_type = "saved"
                            user_status_text = "ваши сохраненные сообщения"
                            user_online = False
                        elif getattr(u, 'bot', False):
                            title = u.first_name or "Без имени"
                            chat_type = "bot"
                            user_status_text = "бот"
                            user_online = False
                        else:
                            title = u.first_name or "Без имени"
                            chat_type = "private"
                            user_status_text, user_online = format_raw_user_status(getattr(u, 'status', None))
                        user_username = getattr(u, 'username', '') or ''
                        user_phone = getattr(u, 'phone', '') or ''
                elif isinstance(peer, PeerChat):
                    c = chats_dict.get(peer.chat_id)
                    if c:
                        chat_id = -c.id
                        title = getattr(c, 'title', "Без имени")
                        chat_type = "group"
                        user_status_text = "группа"
                elif isinstance(peer, PeerChannel):
                    c = chats_dict.get(peer.channel_id)
                    if c:
                        chat_id = int(f"-100{c.id}")
                        title = getattr(c, 'title', "Без имени")
                        chat_type = "channel" if getattr(c, 'broadcast', False) else "supergroup"
                        user_status_text = "канал" if chat_type == "channel" else "супергруппа"
                
                if not chat_id or chat_id in seen_dialog_ids:
                    continue
                seen_dialog_ids.add(chat_id)
                    
                top = chat_to_msg.get(chat_id)
                author_name = None
                is_outgoing = False
                out_status = None
                
                if top:
                    raw_text = top.text if top.text else _media_label(top)
                    preview = str(raw_text or "")[:120]
                    is_outgoing = bool(getattr(top, "outgoing", False))
                    if is_outgoing:
                        read_max = getattr(d, 'read_outbox_max_id', 0)
                        if read_max and read_max >= top.id:
                            out_status = "read"
                        else:
                            out_status = "sent"
                    else:
                        from_user = getattr(top, "from_user", None)
                        if from_user and chat_type in ("group", "supergroup"):
                            author_name = getattr(from_user, "first_name", "") or getattr(from_user, "username", "")
                    ts = int(top.date.timestamp()) if hasattr(top.date, 'timestamp') else int(top.date)
                else:
                    preview = "Нет сообщений"
                    ts = 0
                    
                items.append({
                    "id": chat_id,
                    "title": title,
                    "type": chat_type,
                    "unread": getattr(d, 'unread_count', 0),
                    "preview": preview,
                    "ts": ts,
                    "color": _avatar_color(chat_id),
                    "muted": False,
                    "pinned": getattr(d, "pinned", False),
                    "folder_id": getattr(d, "folder_id", 0),
                    "message_id": top.id if top else 0,
                    "is_outgoing": is_outgoing,
                    "out_status": out_status,
                    "read_outbox_max_id": getattr(d, 'read_outbox_max_id', 0),
                    "author_name": author_name,
                    "status_text": user_status_text,
                    "online": user_online,
                    "username": user_username,
                    "phone": user_phone,
                })
                
            last = dialogs[-1]
            last_peer_id = get_peer_id(last.peer)
            last_msg = chat_to_msg.get(last_peer_id)
            offset_date = int(last_msg.date.timestamp()) if last_msg and hasattr(last_msg.date, 'timestamp') else 0
            offset_id = getattr(last, 'top_message', 0)
            offset_peer = await client.resolve_peer(last_peer_id)
    except Exception as e:
        import traceback
        logger.error(f'Error in _load_dialogs: {e}\n{traceback.format_exc()}')
        
    try:
        async with get_db() as db:
            for item in items:
                chat_id = item["id"]
                message_id = item.get("message_id", 0)
                if not message_id:
                    continue
                await db.execute(
                    "DELETE FROM messages WHERE account = ? AND chat_id = ?",
                    (client.name, chat_id)
                )
                await db.execute(
                    """
                    INSERT INTO messages 
                    (account, chat_id, message_id, chat_title, text, date, is_outgoing, is_read) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (client.name, chat_id, message_id, item["title"], item["preview"], item["ts"], item.get("is_outgoing", False), 0 if item["unread"] > 0 else 1)
                )
            await db.commit()
    except Exception as e:
        logger.error(f"DB sync error in _load_dialogs: {e}")

    return items

def _dialog_from_chat(chat):
    title = chat.title or chat.first_name or "Без названия"
    return {
        "id": chat.id,
        "title": title,
        "type": chat.type,
        "unread": 0,
        "preview": _chat_subtitle(chat),
        "ts": 0,
        "color": _avatar_color(chat.id),
        "muted": False,
    }

# --- Аватарки и медиа -----------------------------------------------------------
# --- Аватарки и медиа (Персистентный дисковый кэш) --------------------------------
async def _get_avatar_file(client, chat_id):
    """Возвращает Path к файлу аватарки на диске (с постоянным кэшем) или None."""
    safe_acc = re.sub(r'[^a-zA-Z0-9_-]', '_', str(client.name))
    avatar_file = AVATAR_DIR / f"{safe_acc}_{chat_id}.jpg"
    if avatar_file.exists() and avatar_file.stat().st_size > 0:
        return avatar_file

    key = (client.name, chat_id)
    lock = AVATAR_LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        if avatar_file.exists() and avatar_file.stat().st_size > 0:
            return avatar_file
        await _ensure_peers(client)
        tmp_file = AVATAR_DIR / f"tmp_{safe_acc}_{chat_id}_{time.time_ns()}.jpg"
        try:
            async for photo in client.get_chat_photos(chat_id, limit=1):
                thumbs = getattr(photo, "thumbs", None) or []
                target = thumbs[-1].file_id if thumbs else photo.file_id
                downloaded = await asyncio.wait_for(
                    client.download_media(target, file_name=str(tmp_file)),
                    timeout=20
                )
                if downloaded and tmp_file.exists() and tmp_file.stat().st_size > 0:
                    os.replace(tmp_file, avatar_file)
                    return avatar_file
                break
        except Exception as e:
            logger.debug(f"Avatar download error for {chat_id}: {e}")
        finally:
            if tmp_file.exists():
                try: tmp_file.unlink()
                except Exception: pass
    return None

async def _avatar_bytes(client, chat_id):
    """Совместимость: возвращает структуру с байтами аватарки из дискового кэша."""
    p = await _get_avatar_file(client, chat_id)
    if not p:
        return None
    try:
        with open(p, "rb") as f:
            data = f.read()
        return {"mime": "image/jpeg", "name": f"{client.name}_{chat_id}.jpg", "bytes": data}
    except Exception:
        return None

async def _get_media_file(client, account, chat_id, message_id, kind):
    """Возвращает (file_path, mime, filename) на диске с постоянным кэшем или None."""
    safe_acc = re.sub(r'[^a-zA-Z0-9_-]', '_', str(account))
    base_name = f"{safe_acc}_{chat_id}_{message_id}_{kind}"
    data_file = MEDIA_DIR / f"{base_name}.bin"
    meta_file = MEDIA_DIR / f"{base_name}.json"

    if data_file.exists() and meta_file.exists() and data_file.stat().st_size > 0:
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            return data_file, meta.get("mime", "application/octet-stream"), meta.get("name", f"{message_id}_{kind}")
        except Exception:
            pass

    key = f"{account}:{chat_id}:{message_id}:{kind}"
    lock = MEDIA_LOCKS.setdefault(key, asyncio.Lock())
    async with lock:
        if data_file.exists() and meta_file.exists() and data_file.stat().st_size > 0:
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                return data_file, meta.get("mime", "application/octet-stream"), meta.get("name", f"{message_id}_{kind}")
            except Exception:
                pass

        await _ensure_peers(client)
        try:
            m = await client.get_messages(chat_id, message_id)
        except Exception as e:
            try:
                if chat_id > 0:
                    await client.get_users([chat_id])
                else:
                    await client.get_chat(chat_id)
                m = await client.get_messages(chat_id, message_id)
            except Exception as e2:
                logger.warning(f"Error fetching message {message_id} in {chat_id}: {e2}")
                return None

        if m is None or getattr(m, "empty", False):
            return None

        if kind == "web_page" and getattr(m, "web_page", None) and getattr(m.web_page, "photo", None):
            media_obj = m.web_page.photo
        else:
            media_obj = getattr(m, kind, None)

        if media_obj is None:
            for fallback_kind in ("photo", "video", "document", "animation", "voice", "video_note", "sticker", "audio"):
                cand = getattr(m, fallback_kind, None)
                if cand is not None:
                    media_obj = cand
                    kind = fallback_kind
                    break

        if media_obj is None:
            return None

        fsize = getattr(media_obj, "file_size", 0) or 0
        if kind in ("video", "video_note", "animation") and fsize > MAX_VIDEO_BYTES:
            logger.warning(f"Media exceeds max video bytes: {fsize}")
            return None

        tmp_data = MEDIA_DIR / f"tmp_{base_name}_{time.time_ns()}.bin"
        tmp_meta = MEDIA_DIR / f"tmp_{base_name}_{time.time_ns()}.json"
        try:
            download_target = media_obj if media_obj is not None else m
            downloaded = await asyncio.wait_for(
                client.download_media(download_target, file_name=str(tmp_data)),
                timeout=90
            )
            if not downloaded or not tmp_data.exists() or tmp_data.stat().st_size == 0:
                return None

            name = getattr(media_obj, "file_name", "") or getattr(m, "caption", "") or f"{message_id}_{kind}"
            mime = mimetypes.guess_type(name)[0]
            if kind == "voice": mime = "audio/ogg"
            elif kind == "video_note": mime = "video/mp4"
            elif kind in ("photo", "web_page"): mime = mime if (mime and mime.startswith("image/")) else "image/jpeg"
            elif kind == "sticker": mime = "video/webm" if getattr(media_obj, "is_video", False) else "image/webp"
            elif kind in ("video", "animation"): mime = mime if (mime and mime.startswith("video/")) else "video/mp4"
            elif kind == "audio": mime = mime if (mime and mime.startswith("audio/")) else "audio/mpeg"
            elif not mime: mime = "application/octet-stream"

            meta = {
                "mime": mime,
                "name": os.path.basename(name) or f"{message_id}_{kind}",
                "size": tmp_data.stat().st_size
            }
            with open(tmp_meta, "w", encoding="utf-8") as f:
                json.dump(meta, f)

            os.replace(tmp_data, data_file)
            os.replace(tmp_meta, meta_file)
            return data_file, meta["mime"], meta["name"]
        except Exception as e:
            logger.warning(f"Error downloading media for {key}: {e}")
            return None
        finally:
            if tmp_data.exists():
                try: tmp_data.unlink()
                except Exception: pass
            if tmp_meta.exists():
                try: tmp_meta.unlink()
                except Exception: pass

async def _media_bytes(client, account, chat_id, message_id, kind):
    """Совместимость: достаёт медиа через дисковый кэш и возвращает словарь."""
    res = await _get_media_file(client, account, chat_id, message_id, kind)
    if not res:
        return None
    data_file, mime, name = res
    try:
        with open(data_file, "rb") as f:
            data = f.read()
        return {"mime": mime, "name": name, "bytes": data}
    except Exception:
        return None

# --- Сообщения -----------------------------------------------------------------
async def _fetch_messages(client, chat_id, limit=60, since_id=None, offset_id=None):
    """Возвращает сообщения в хронологическом порядке с жестким таймаутом и защитой от зависания."""
    async def _do_fetch():
        out = []
        try:
            await asyncio.wait_for(_ensure_peers(client), timeout=2.0)
        except Exception:
            pass
        peer = await client.resolve_peer(chat_id)
        from pyrogram.raw.functions.messages import GetHistory
        from pyrogram.utils import parse_messages
        
        from_msg_id = offset_id or 0
        fetch_limit = min(limit + 10, 100) if since_id is None else 30
        
        while len(out) < limit:
            r = await client.invoke(
                GetHistory(
                    peer=peer,
                    offset_id=from_msg_id,
                    offset_date=0,
                    add_offset=0,
                    limit=fetch_limit,
                    max_id=0,
                    min_id=since_id or 0,
                    hash=0
                ),
                sleep_threshold=5
            )
            parsed = await parse_messages(client, r, replies=0)
            valid_msgs = [m for m in parsed if m is not None]
            if not valid_msgs:
                break
                
            for m in valid_msgs:
                if getattr(m, "service", False):
                    continue
                if since_id is not None and m.id <= since_id:
                    break
                out.append(m)
                if len(out) >= limit:
                    break
                    
            if since_id is not None or len(valid_msgs) < fetch_limit or len(out) >= limit:
                break
                
            last_raw_id = None
            if hasattr(r, "messages") and r.messages:
                for rm in reversed(r.messages):
                    if hasattr(rm, "id") and getattr(rm, "id", None):
                        last_raw_id = rm.id
                        break
            if not last_raw_id or last_raw_id == from_msg_id:
                break
            from_msg_id = last_raw_id
        out.reverse()
        return out

    try:
        return await asyncio.wait_for(_do_fetch(), timeout=3.5)
    except asyncio.TimeoutError:
        logger.warning(f"_fetch_messages: Timeout (>3.5s) for chat_id={chat_id}")
        return []
    except Exception as e:
        import traceback
        logger.error(f"Error in _fetch_messages: {e}\n{traceback.format_exc()}")
        return []

async def _is_group_chat(client, account, chat_id):
    if chat_id > 0:
        return False
    key = (account, chat_id)
    value = group_cache.get(key)
    if value is not None:
        group_cache.move_to_end(key)
        return value

    # Check dialog_caches without network call
    acc_name = account or getattr(client, "name", None)
    if acc_name and acc_name in dialog_caches:
        for dlg in dialog_caches[acc_name].get("items", []):
            if dlg.get("id") == chat_id:
                value = dlg.get("type") in ("group", "supergroup")
                if len(group_cache) >= GROUP_CACHE_LIMIT:
                    group_cache.popitem(last=False)
                group_cache[key] = value
                return value

    try:
        chat = await client.get_chat(chat_id)
        value = chat.type in (getattr(chat.type, "GROUP", "group"), getattr(chat.type, "SUPERGROUP", "supergroup")) or str(chat.type) in ("ChatType.GROUP", "ChatType.SUPERGROUP")
    except Exception:
        value = (chat_id < 0)
    # LRU eviction
    if len(group_cache) >= GROUP_CACHE_LIMIT:
        group_cache.popitem(last=False)
    group_cache[key] = value
    return value

def _msg_group_id(m):
    return getattr(m, "media_group_id", None) or getattr(m, "grouped_id", None)

def _group_messages(msgs):
    """Группирует подряд идущие сообщения с одинаковым media_group_id (медиа-альбомы).

    Идёт по хронологии (старые -> новые), каждая группа = один альбом.
    """
    groups = []
    current = []
    for m in msgs:
        gid = _msg_group_id(m)
        if gid and current and _msg_group_id(current[-1]) == gid:
            current.append(m)
        else:
            if current:
                groups.append(current)
            current = [m]
    if current:
        groups.append(current)
    return groups

async def _render_messages(client, account, chat_id, limit=60, since_id=None, offset_id=None):
    acc_name = account or getattr(client, "name", None)
    if since_id is None and offset_id is None:
        cached = _get_cached_messages(acc_name, chat_id, limit)
        if cached is not None:
            return cached

    msgs = await _fetch_messages(client, chat_id, limit, since_id, offset_id)
    if since_id is None:
        is_group = await _is_group_chat(client, account, chat_id)
    else:
        is_group = False
        for m in msgs:
            if m.chat and (m.chat.type in (getattr(m.chat.type, "GROUP", "group"), getattr(m.chat.type, "SUPERGROUP", "supergroup")) or str(m.chat.type) in ("ChatType.GROUP", "ChatType.SUPERGROUP")):
                is_group = True
                break
    read_outbox_max_id = 0
    if acc_name and acc_name in dialog_caches:
        for dlg in dialog_caches[acc_name].get("items", []):
            if dlg.get("id") == chat_id:
                read_outbox_max_id = dlg.get("read_outbox_max_id", 0)
                break

    if not read_outbox_max_id and since_id is None:
        async def _bg_update_read_max():
            try:
                peer = await client.resolve_peer(chat_id)
                r = await client.invoke(raw.functions.messages.GetPeerDialogs(peers=[raw.types.InputDialogPeer(peer=peer)]))
                if r and r.dialogs:
                    rm = getattr(r.dialogs[0], "read_outbox_max_id", 0)
                    if rm and acc_name and acc_name in dialog_caches:
                        for dlg in dialog_caches[acc_name].get("items", []):
                            if dlg.get("id") == chat_id:
                                dlg["read_outbox_max_id"] = rm
                                break
            except Exception:
                pass
        asyncio.create_task(_bg_update_read_max())

    parts = []
    for group in _group_messages(msgs):
        if len(group) == 1:
            parts.append(_render_message_html(group[0], is_group, account, chat_id, read_outbox_max_id))
        else:
            parts.append(_render_album_html(group, is_group, account, chat_id, read_outbox_max_id))
    html_res = "".join(parts)
    if since_id is None and offset_id is None and html_res:
        _put_cached_messages(acc_name, chat_id, limit, html_res, read_outbox_max_id)

    # Фоновая предзагрузка превью медиа для открытого чата (чтобы отдавать браузеру мгновенно)
    try:
        safe_acc = re.sub(r'[^a-zA-Z0-9_-]', '_', str(acc_name))
        for m in msgs[-15:]:
            if getattr(m, "photo", None) or getattr(m, "video_note", None):
                m_kind = "photo" if getattr(m, "photo", None) else "video_note"
                base_check = f"{safe_acc}_{chat_id}_{m.id}_{m_kind}"
                if not (MEDIA_DIR / f"{base_check}.bin").exists():
                    asyncio.create_task(_get_media_file(client, acc_name, chat_id, m.id, m_kind))
    except Exception:
        pass

    return html_res, read_outbox_max_id

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Инициализируем нашу базу данных при старте!
    await init_db()

    async def _init_farm_accounts():
        # --- Параллельный молниеносный запуск сессий из папки проекта ---
        session_files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".session") and not f.startswith("copy_") and not f.startswith("test_")]
        start_sem = asyncio.Semaphore(10)
        preload_sem = asyncio.Semaphore(6)

        async def _preload_account(c):
            async with preload_sem:
                try:
                    lock = dialog_locks.setdefault(c.name, asyncio.Lock())
                    async with lock:
                        items = await _load_dialogs(c)
                        dialog_caches[c.name] = {"items": items, "ready": True}
                    for dlg in items[:3]:
                        dlg_id = dlg.get("id")
                        if dlg_id:
                            try:
                                await _render_messages(c, c.name, dlg_id, limit=60)
                            except Exception:
                                pass
                except Exception:
                    pass

        async def _launch_account(account_name):
            async with start_sem:
                try:
                    ok, client, msg = await start_single_client(account_name)
                    if ok and client:
                        logger.info(f"Аккаунт {account_name} успешно запущен!")
                        asyncio.create_task(_preload_account(client))
                    else:
                        logger.warning(f"Аккаунт {account_name} не запущен: {msg}")
                except Exception as e:
                    logger.error(f"Не удалось запустить {account_name}: {e}")

        tasks = []
        for filename in session_files:
            account_name = filename[:-len(".session")]
            tasks.append(asyncio.create_task(_launch_account(account_name)))
            await asyncio.sleep(0.04)

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        await _sync_accounts()
        logger.info(f"Подключено аккаунтов: {len(accounts_cache)}")
        try:
            from utils import manager
            await manager.broadcast({"type": "accounts_updated", "status": "ready"})
        except Exception:
            pass

        # Автовосстановление задач прогрева после перезапуска программы / системы
        try:
            from leomatch_engine import resume_interrupted_warmup_tasks
            await resume_interrupted_warmup_tasks()
        except Exception as e:
            logger.error(f"Ошибка автовосстановления прерванных задач прогрева: {e}")

    init_task = asyncio.create_task(_init_farm_accounts())
    reaper = asyncio.create_task(_pending_reaper_task())
    yield
    init_task.cancel()
    reaper.cancel()
    async with clients_lock:
        clients_copy = clients.copy()

    for client in clients_copy:
        try:
            await client.stop()
        except Exception:
            logger.exception(f"Ошибка при остановке клиента {client.name}")

    for auth_data in list(pending_clients.values()):
        client = auth_data.get("client")
        if client:
            try:
                if client.is_connected:
                    await client.disconnect()
            except Exception:
                logger.exception(f"Ошибка при отключении ожидающего клиента {client.name}")

app_web = FastAPI(lifespan=lifespan)

app_web.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
from routers import router
app_web.include_router(router)
app_web.include_router(auth_router)
from groups_router import groups_router
app_web.include_router(groups_router)
from farm_tools_router import farm_tools_router
app_web.include_router(farm_tools_router)
from leomatch_router import leomatch_router
app_web.include_router(leomatch_router)

# --- JSON API ------------------------------------------------------------------

async def _get_single_account_dialogs(account_name: str, fresh: int):
    client = await _get_client(account_name)
    if client is None:
        return []
    
    lock = dialog_locks.setdefault(account_name, asyncio.Lock())
    cache = dialog_caches.get(account_name)
    if fresh or not cache or not cache.get("ready"):
        async with lock:
            cache = dialog_caches.get(account_name)
            if fresh or not cache or not cache.get("ready"):
                items = await _load_dialogs(client)
                dialog_caches[account_name] = {"items": items, "ready": True}
    
    # Inject account name into each dialog
    items = dialog_caches[account_name]["items"]
    for i in items:
        i["account_name"] = account_name
    return items

@app_web.get("/api/dialogs", dependencies=[Depends(get_current_user)])
async def api_dialogs(request: Request, account: str = None, group_id: int = None, offset: int = 0, limit: int = 80, fresh: int = 0):
    await check_rate_limit(request, max_req=1200, scope="read")
    
    target_accounts = []
    if account and account != "*":
        target_accounts.append(account)
    else:
        async with get_db() as db:
            if group_id:
                cursor = await db.execute("SELECT name FROM accounts WHERE work_group_id = ?", (group_id,))
            else:
                cursor = await db.execute("SELECT name FROM accounts")
            rows = await cursor.fetchall()
            target_accounts = [r[0] for r in rows]
            
    # For Unified Inbox, load in batches to avoid FloodWait
    # E.g. batch size of 5 accounts concurrently
    all_items = []
    batch_size = 5
    for i in range(0, len(target_accounts), batch_size):
        batch = target_accounts[i:i+batch_size]
        tasks = [_get_single_account_dialogs(acc, fresh) for acc in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, list):
                all_items.extend(res)
    
    # Deduplicate items by (account_name, id)
    seen_keys = set()
    unique_items = []
    for it in all_items:
        acc_k = it.get("account_name") or it.get("account") or ""
        k = (acc_k, it.get("id"))
        if k not in seen_keys:
            seen_keys.add(k)
            unique_items.append(it)
    all_items = unique_items

    # Sort all items by ts descending
    all_items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    
    total = len(all_items)
    chunk = all_items[offset:offset + limit]
    return {"items": chunk, "offset": min(offset + limit, total), "total": total}

@app_web.get("/api/dialog", dependencies=[Depends(get_current_user)])
async def api_dialog(request: Request, account: str, chat_id: int):
    await check_rate_limit(request, max_req=1200, scope="read")
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"error": "Аккаунт не найден"}, status_code=404)
    try:
        chat = await client.get_chat(chat_id)
    except Exception as error:
        return JSONResponse({"error": str(error)}, status_code=404)
    d = _dialog_from_chat(chat)
    d["account_name"] = account
    return d

@app_web.get("/api/user", dependencies=[Depends(get_current_user)])
async def api_user(request: Request, account: str, user_id: int):
    await check_rate_limit(request, max_req=3000, scope="read")
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"error": "Аккаунт не найден"}, status_code=404)
    try:
        users = await client.get_users([user_id])
        if not users:
            return JSONResponse({"error": "Пользователь не найден"}, status_code=404)
        u = users[0]
        name = ((u.first_name or "").strip() + " " + (u.last_name or "").strip()).strip() or "Пользователь"
        return JSONResponse({
            "id": u.id,
            "name": name,
            "username": u.username,
            "phone": getattr(u, "phone_number", None),
            "status": str(getattr(u, "status", ""))
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app_web.get("/api/avatar", dependencies=[Depends(get_current_user)])
async def api_avatar(request: Request, account: str, chat_id: int):
    await check_rate_limit(request, max_req=5000, scope="media")
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"error": "Аккаунт не найден"}, status_code=404)
    file_path = await _get_avatar_file(client, chat_id)
    if not file_path:
        return JSONResponse({"error": "Аватарка отсутствует"}, status_code=404)
    return FileResponse(
        path=file_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )

@app_web.get("/api/media", dependencies=[Depends(get_current_user)])
async def api_media(request: Request, account: str, chat_id: int, message_id: int, kind: str = "photo", download: int = 0, video: int = 0):
    await check_rate_limit(request, max_req=5000, scope="media")
    if video or request.query_params.get("video") == "1":
        kind = "video"
    if kind not in MEDIA_KINDS:
        return JSONResponse({"error": "Неизвестный тип медиа"}, status_code=400)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"error": "Аккаунт не найден"}, status_code=404)
    res = await _get_media_file(client, account, chat_id, message_id, kind)
    if not res:
        return JSONResponse({"error": "Медиа недоступно"}, status_code=404)
    file_path, mime, filename = res
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes"}
    disp_type = "attachment" if download else "inline"
    return FileResponse(
        path=file_path,
        media_type=mime,
        filename=filename,
        content_disposition_type=disp_type,
        headers=headers
    )

@app_web.get("/get_messages", response_class=HTMLResponse, dependencies=[Depends(get_current_user)])
@app_web.get("/get_messages/", response_class=HTMLResponse, dependencies=[Depends(get_current_user)])
async def get_messages(
    request: Request,
    account: str,
    chat_id: int,
    since_id: Optional[str] = None,
    offset_id: Optional[str] = None,
    limit: int = 60
):
    await check_rate_limit(request, max_req=1200, scope="read")
    
    # Safely parse since_id and offset_id
    s_id = None
    if since_id is not None and str(since_id).strip() not in ("", "undefined", "null", "NaN", "0"):
        try:
            s_id = int(since_id)
        except (ValueError, TypeError):
            s_id = None

    off_id = None
    if offset_id is not None and str(offset_id).strip() not in ("", "undefined", "null", "NaN", "0"):
        try:
            off_id = int(offset_id)
        except (ValueError, TypeError):
            off_id = None

    client = await _get_client(account)
    if client is None:
        logger.warning(f"get_messages: Client not found for account '{account}', chat_id {chat_id}")
        return Response(content="", media_type="text/html")

    html, read_outbox_max_id = await _render_messages(client, account, chat_id, limit, s_id, off_id)
    headers = {"X-Read-Outbox-Max-Id": str(read_outbox_max_id)}
    logger.info(f"get_messages: account='{account}' chat_id={chat_id} -> {len(html)} bytes (read_max={read_outbox_max_id})")
    return Response(content=html, media_type="text/html", headers=headers)

@app_web.get("/diagnostics/accounts", dependencies=[Depends(get_current_user)])
async def account_diagnostics(request: Request):
    await check_rate_limit(request)
    async with clients_lock:
        clients_copy = clients.copy()

    async def _diag_account(client):
        try:
            me = await client.get_me()
            return {
                "session": client.name,
                "user_id": me.id,
                "phone_number": f"+{me.phone_number}" if me.phone_number else None,
                "name": " ".join(part for part in (me.first_name, me.last_name) if part),
            }
        except Exception:
            return None

    results = await asyncio.gather(*(_diag_account(c) for c in clients_copy))
    return [r for r in results if r]

if __name__ == "__main__":
    import uvicorn
    dev_mode = os.environ.get("DEV_RELOAD", "1").lower() in ("1", "true", "yes")
    uvicorn.run(
        "main:app_web",
        host="127.0.0.1",
        port=8000,
        reload=dev_mode,
        access_log=True
    )