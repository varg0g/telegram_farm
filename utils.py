import time
import hashlib
import json
import asyncio
import random
import urllib.parse
from pathlib import Path
from fastapi import Request, HTTPException, Cookie
import os
import aiosqlite
from logger import logger
from typing import List, Optional, Tuple, Dict, Any
try:
    loop = asyncio.get_running_loop()
except RuntimeError:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
from pyrogram import Client, filters
from pyrogram.handlers import MessageHandler, DeletedMessagesHandler, RawUpdateHandler
from session_guard import (
    detect_and_migrate_session, freeze_device_profile,
    read_device_fingerprint, safe_quarantine_session
)

DELIVERY_NAMES = {
    "APP": "внутреннее сообщение Telegram",
    "SMS": "SMS",
    "CALL": "телефонный звонок",
    "FLASH_CALL": "короткий звонок (сброс)",
    "MISSED_CALL": "пропущенный звонок",
    "FRAGMENT_SMS": "Fragment SMS",
    "EMAIL_CODE": "электронная почта",
}

pending_clients = {}

# Простой in-memory rate limiter ( (IP, scope) -> [timestamp, count] )
BASE_DIR = Path(__file__).resolve().parent
SESSIONS_DIR = BASE_DIR / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

_config = {}
if (BASE_DIR / "config.json").exists():
    import json
    with open(BASE_DIR / "config.json", "r", encoding="utf-8") as f:
        _config = json.load(f)

rate_limits = {}
accounts_cache = []
account_errors: Dict[str, str] = {}

def delete_session_files(name, reason="unauthorized"):
    """Безопасный карантин: вместо необратимого стирания файлов перемещает их в sessions/revoked/"""
    safe_quarantine_session(name, reason=reason)


async def _get_client(name):
    if not name:
        return None
    name_str = str(name).strip()
    c = clients_dict.get(name_str)
    if c is not None:
        return c

    clean = name_str.lstrip("+")
    c = clients_dict.get(clean)
    if c is not None:
        return c

    c = clients_dict.get("+" + clean)
    if c is not None:
        return c

    async with clients_lock:
        for cl in clients:
            if cl.name in (name_str, clean, "+" + clean):
                return cl
            if getattr(cl, "phone_number", None) in (name_str, clean, "+" + clean):
                return cl
            if hasattr(cl, "me") and cl.me and getattr(cl.me, "phone_number", None) in (name_str, clean, "+" + clean):
                return cl

        for a in accounts_cache:
            a_phone = (a.get("phone") or "").lstrip("+")
            a_name = (a.get("name") or "").lstrip("+")
            if clean in (a_phone, a_name):
                target_name = a.get("name")
                for cl in clients:
                    if cl.name == target_name:
                        return cl
    return None


async def check_rate_limit(request: Request, max_req: int = 1200, window: int = 60, scope: str = "read"):
    ip = request.client.host if request.client else "127.0.0.1"
    if ip in ("127.0.0.1", "localhost", "::1"):
        max_req = max(max_req, 10000)
    key = (ip, scope)
    now = time.time()
    if key not in rate_limits:
        rate_limits[key] = [now, 1]
        return
    start_time, count = rate_limits[key]
    if now - start_time > window:
        rate_limits[key] = [now, 1]
    else:
        if count >= max_req:
            raise HTTPException(status_code=429, detail="Too Many Requests")
        rate_limits[key][1] += 1

ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH") or _config.get("admin_password_hash")
SESSION_COOKIE_NAME = "tf_session"
CSRF_COOKIE_NAME = "tf_csrf"

async def get_current_user(request: Request):
    if not ADMIN_PASSWORD_HASH:
        return True
    session = request.cookies.get(SESSION_COOKIE_NAME)
    expected = hashlib.sha256((ADMIN_PASSWORD_HASH + "tf_salt").encode()).hexdigest()
    if not session or session != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

def verify_csrf(request: Request):
    if not ADMIN_PASSWORD_HASH:
        return True
    cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)
    header_csrf = request.headers.get("x-csrf-token")
    if not cookie_csrf or not header_csrf or cookie_csrf != header_csrf:
        raise HTTPException(status_code=403, detail="CSRF mismatch")
    return True



INDEX_HTML = ""
if (BASE_DIR / "index.html").exists():
    with open(BASE_DIR / "index.html", "r", encoding="utf-8") as f:
        INDEX_HTML = f.read()

dialog_caches = {}           # name -> {"items": [...], "ready": bool}
dialog_locks = {}            # name -> asyncio.Lock
clients = []                 # Список подключённых клиентов Pyrogram
clients_dict = {}            # name -> Client (быстрый доступ O(1))
clients_lock = asyncio.Lock()  # Защита clients от race conditions

# --- Глобальная лента сообщений (Feed) ---
async def catch_new_message(client, message):
    if not message or not getattr(message, "chat", None):
        return

    # Не засоряем ленту и сокеты служебными анкетами Дайвинчика во время фоновых задач
    chat_uname = (getattr(message.chat, "username", "") or "").lower()
    if chat_uname == "leomatchbot":
        from task_manager import task_manager
        if task_manager.account_locks.get(client.name):
            return

    from render import _media_label
    preview_text = message.text or _media_label(message) or "Сообщение"
    chat_title = message.chat.title or message.chat.first_name or "Чат"

    logger.info(f"⚡ НОВОЕ СООБЩЕНИЕ ИЗ БД ! Аккаунт: {client.name} | Чат: {chat_title}")

    text_short = preview_text[:150] + "..." if len(preview_text) > 150 else preview_text
    msg_date = int(message.date.timestamp()) if message.date else int(time.time())
    
    # 1. Запись в SQLite через надежный get_db
    try:
        from database import get_db
        async with get_db() as db:
            await db.execute(
                "DELETE FROM messages WHERE account = ? AND chat_id = ?",
                (client.name, message.chat.id)
            )
            await db.execute(
                """
                INSERT INTO messages 
                (account, chat_id, message_id, chat_title, text, date, is_outgoing, is_read) 
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (client.name, message.chat.id, message.id, chat_title, text_short, msg_date, message.outgoing)
            )
            await db.commit()
    except Exception:
        logger.exception(f"Failed to save message to db for {client.name}")

    # 2. Обновление кэша в памяти и отправка WebSocket
    try:
        chat_id = message.chat.id
        author_name = None
        if not message.outgoing and getattr(message, "from_user", None) and getattr(message.chat, "type", None) in ("group", "supergroup"):
            author_name = getattr(message.from_user, "first_name", "") or getattr(message.from_user, "username", "")
        
        cache = dialog_caches.get(client.name)
        if cache and cache.get("items"):
            items = cache["items"]
            target = next((item for item in items if item["id"] == chat_id), None)
            if target:
                items.remove(target)
                target["preview"] = text_short
                target["ts"] = msg_date
                target["is_outgoing"] = bool(message.outgoing)
                target["out_status"] = "sent" if message.outgoing else None
                target["author_name"] = author_name
                if not message.outgoing:
                    target["unread"] = target.get("unread", 0) + 1
                
                if target.get("pinned"):
                    items.insert(0, target)
                else:
                    insert_idx = 0
                    for i, item in enumerate(items):
                        if not item.get("pinned"):
                            insert_idx = i
                            break
                    else:
                        insert_idx = len(items)
                    items.insert(insert_idx, target)
        
        logger.info(f"Broadcasting to {len(manager.active_connections)} websockets")
        
        await manager.broadcast({
            "type": "new_message",
            "account": client.name,
            "chat_id": chat_id,
            "text": text_short,
            "is_incoming": not message.outgoing,
            "is_outgoing": bool(message.outgoing),
            "out_status": "sent" if message.outgoing else None,
            "author_name": author_name
        })
    except Exception as e:
        logger.error(f"WS/Cache error: {e}")

async def on_deleted_messages(client, messages):
    try:
        # messages is a list of Message objects
        chat_id = messages[0].chat.id if messages and messages[0].chat else None
        if chat_id:
            logger.info(f"Broadcasting to {len(manager.active_connections)} websockets")
        
        await manager.broadcast({
                "type": "deleted_messages",
                "account": client.name,
                "chat_id": chat_id,
                "message_ids": [m.id for m in messages]
            })
    except Exception as e:
        pass

def format_raw_user_status(st, last_online_date=None):
    from pyrogram import raw
    from datetime import datetime, timedelta
    if not st:
        if last_online_date:
            try:
                dt = last_online_date if isinstance(last_online_date, datetime) else datetime.fromtimestamp(last_online_date)
                now = datetime.now()
                if dt.date() == now.date():
                    return (f"был(а) сегодня в {dt.strftime('%H:%M')}", False)
                elif dt.date() == (now - timedelta(days=1)).date():
                    return (f"был(а) вчера в {dt.strftime('%H:%M')}", False)
                elif dt.year == now.year:
                    return (f"был(а) {dt.strftime('%d.%m в %H:%M')}", False)
                else:
                    return (f"был(а) {dt.strftime('%d.%m.%Y')}", False)
            except Exception:
                pass
        return ("не в сети", False)

    st_str = str(getattr(st, "name", st)).lower()
    if isinstance(st, raw.types.UserStatusOnline) or "userstatusonline" in st_str or st_str == "online":
        return ("в сети", True)
    elif isinstance(st, raw.types.UserStatusOffline) or "userstatusoffline" in st_str or st_str == "offline":
        was_online = getattr(st, "was_online", None) or last_online_date
        if not was_online:
            return ("не в сети", False)
        try:
            dt = was_online if isinstance(was_online, datetime) else datetime.fromtimestamp(was_online)
            now = datetime.now()
            if dt.date() == now.date():
                return (f"был(а) сегодня в {dt.strftime('%H:%M')}", False)
            elif dt.date() == (now - timedelta(days=1)).date():
                return (f"был(а) вчера в {dt.strftime('%H:%M')}", False)
            elif dt.year == now.year:
                return (f"был(а) {dt.strftime('%d.%m в %H:%M')}", False)
            else:
                return (f"был(а) {dt.strftime('%d.%m.%Y')}", False)
        except Exception:
            return ("не в сети", False)
    elif isinstance(st, raw.types.UserStatusRecently) or "recently" in st_str:
        return ("был(а) недавно", False)
    elif isinstance(st, raw.types.UserStatusLastWeek) or "last_week" in st_str or "lastweek" in st_str:
        return ("был(а) на этой неделе", False)
    elif isinstance(st, raw.types.UserStatusLastMonth) or "last_month" in st_str or "lastmonth" in st_str:
        return ("был(а) в этом месяце", False)
    return ("не в сети", False)

async def catch_raw_update(client, update, users, chats):
    try:
        from pyrogram import raw
        if isinstance(update, raw.types.UpdateReadHistoryOutbox):
            peer = update.peer
            chat_id = None
            if isinstance(peer, raw.types.PeerUser):
                chat_id = peer.user_id
            elif isinstance(peer, raw.types.PeerChat):
                chat_id = -peer.chat_id
            elif isinstance(peer, raw.types.PeerChannel):
                chat_id = int(f"-100{peer.channel_id}")
            
            max_id = update.max_id
            if chat_id:
                cache = dialog_caches.get(client.name)
                if cache and cache.get("items"):
                    for item in cache["items"]:
                        if item.get("id") == chat_id:
                            item["read_outbox_max_id"] = max(item.get("read_outbox_max_id", 0), max_id)
                            if item.get("is_outgoing") and item.get("message_id", 0) <= max_id:
                                item["out_status"] = "read"
                            break
                await manager.broadcast({
                    "type": "read_history_outbox",
                    "account": client.name,
                    "chat_id": chat_id,
                    "max_id": max_id
                })
        elif isinstance(update, raw.types.UpdateChannelReadHistoryOutbox):
            channel_id = update.channel_id
            chat_id = int(f"-100{channel_id}")
            max_id = update.max_id
            cache = dialog_caches.get(client.name)
            if cache and cache.get("items"):
                for item in cache["items"]:
                    if item.get("id") == chat_id:
                        item["read_outbox_max_id"] = max(item.get("read_outbox_max_id", 0), max_id)
                        if item.get("is_outgoing") and item.get("message_id", 0) <= max_id:
                            item["out_status"] = "read"
                        break
            await manager.broadcast({
                "type": "read_history_outbox",
                "account": client.name,
                "chat_id": chat_id,
                "max_id": max_id
            })
        elif isinstance(update, raw.types.UpdateUserStatus):
            user_id = update.user_id
            st_text, is_online = format_raw_user_status(update.status)
            cache = dialog_caches.get(client.name)
            if cache and cache.get("items"):
                for item in cache["items"]:
                    if item.get("id") == user_id:
                        item["status_text"] = st_text
                        item["online"] = is_online
                        break
            await manager.broadcast({
                "type": "user_status",
                "account": client.name,
                "user_id": user_id,
                "status_text": st_text,
                "online": is_online
            })
    except Exception as e:
        logger.debug(f"catch_raw_update error for {client.name}: {e}")

def make_client(name, api_id, api_hash, device_model="Desktop", system_version="Windows 10", app_version="4.16.8", lang_code="ru", system_lang_code="ru-RU", proxy=None):
    client = Client(
        name=name,
        api_id=api_id,
        api_hash=api_hash,
        app_version=app_version,
        device_model=device_model,
        system_version=system_version,
        lang_code=lang_code,
        workdir=str(SESSIONS_DIR),
        proxy=proxy  # <-- Теперь Pyrogram будет использовать наш прокси!
    )
    client.system_lang_code = system_lang_code
    client.add_handler(MessageHandler(catch_new_message))
    client.add_handler(DeletedMessagesHandler(on_deleted_messages))
    client.add_handler(RawUpdateHandler(catch_raw_update))
    return client


def _get_int(key, default):
    val = os.environ.get(key) or _config.get(key) or default
    try:
        return int(val)
    except (ValueError, TypeError):
        return int(default)

async def _account_record(client):
    try:
        me = await client.get_me()
    except Exception as e:
        logger.exception(f"Failed to get_me() for {client.name}: {e}")
        # Если сессия умерла, закрываем БД и удаляем её файлы
        name_str = type(e).__name__
        if name_str in ("AuthKeyUnregistered", "SessionExpired", "UserDeactivated", "Unauthorized"):
            try:
                if client.is_connected:
                    await client.disconnect()
            except Exception:
                pass
            try:
                client.storage.close()
            except Exception:
                pass
            delete_session_files(client.name)
        return None
    return {
        "name": client.name,
        "id": me.id,
        "first": me.first_name or "",
        "last": me.last_name or "",
        "username": me.username or "",
        "phone": f"+{me.phone_number}" if me.phone_number else "",
    }

async def _sync_accounts():
    async with clients_lock:
        clients_copy = clients.copy()
    results = await asyncio.gather(*(_account_record(c) for c in clients_copy))
    accounts_cache.clear()
    seen = set()
    deduped = []
    for r in results:
        if not r:
            continue
        ident = r.get("id") or r.get("phone") or r.get("name")
        if ident in seen:
            continue
        seen.add(ident)
        deduped.append(r)
    accounts_cache.extend(deduped)

def _upsert_account(rec):
    if not rec:
        return
    new_cache = [a for a in accounts_cache if a["name"] != rec["name"]]
    accounts_cache.clear()
    accounts_cache.extend(new_cache)
    accounts_cache.append(rec)    

# Идентификация клиента: имитируем официальный Telegram Desktop,
# чтобы Telegram не относился к нашей сессии как к "чужому" приложению.

DEVICE_PROFILES = [
    # Новейшие флагманы (Android)
    {"device_model": "Samsung Galaxy S24 Ultra", "system_version": "14", "app_version": "10.6.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Samsung Galaxy S25", "system_version": "15", "app_version": "11.2.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Google Pixel 9 Pro", "system_version": "15", "app_version": "11.3.1", "lang_code": "ru", "system_lang_code": "ru-RU"},
    
    # Массовый сегмент Samsung
    {"device_model": "Samsung Galaxy A53 5G", "system_version": "12", "app_version": "9.5.4", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Samsung Galaxy A54", "system_version": "13", "app_version": "10.1.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Samsung Galaxy S21 FE", "system_version": "12", "app_version": "9.6.2", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Samsung Galaxy S22", "system_version": "13", "app_version": "9.8.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    
    # Xiaomi / Poco / Redmi
    {"device_model": "Redmi Note 10 Pro", "system_version": "11", "app_version": "9.4.2", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Redmi Note 12", "system_version": "13", "app_version": "10.0.5", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "POCO X3 NFC", "system_version": "11", "app_version": "9.3.1", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "POCO F5", "system_version": "13", "app_version": "10.4.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Xiaomi 13T Pro", "system_version": "13", "app_version": "10.5.1", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Xiaomi 14", "system_version": "14", "app_version": "10.8.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    
    # BBK Electronics (OnePlus, Realme, vivo)
    {"device_model": "OnePlus 11", "system_version": "13", "app_version": "10.1.2", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "OnePlus 12", "system_version": "14", "app_version": "10.7.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "Realme GT Neo 3", "system_version": "12", "app_version": "9.9.0", "lang_code": "ru", "system_lang_code": "ru-RU"},
    {"device_model": "vivo X90 Pro", "system_version": "13", "app_version": "10.3.5", "lang_code": "ru", "system_lang_code": "ru-RU"}
]

def get_random_profile():
    profile = random.choice(DEVICE_PROFILES).copy()
    # Мы используем общий рабочий api_id, иначе Telegram может не отправлять коды (из-за отсутствия SafetyNet)
    profile["api_id"] = 36991700
    profile["api_hash"] = "4473427b9db63e8278e91803de929d99"
    return profile

def normalize_proxy(raw_proxy):
    """
    Универсальный нормализатор прокси любого формата:
    - Словарь (Pyrogram): {"scheme": "socks5", "hostname": "...", "port": ...}
    - Массив Telethon / PSSOFT: [2, "ip", port, rdns, "user", "pass"]
    - Массив строк: ["socks5", "ip", port, True, "user", "pass"]
    - Массив из 4 элементов: ["ip", port, "user", "pass"]
    - Строка url: "socks5://user:pass@host:port"
    - Строка с разделителями: "host:port:user:pass" или "host:port"
    """
    if not raw_proxy:
        return None

    # Если передан словарь
    if isinstance(raw_proxy, dict):
        scheme = raw_proxy.get("scheme") or raw_proxy.get("type") or "socks5"
        host = raw_proxy.get("hostname") or raw_proxy.get("host") or raw_proxy.get("ip")
        port = raw_proxy.get("port")
        user = raw_proxy.get("username") or raw_proxy.get("user") or raw_proxy.get("login") or ""
        pwd = raw_proxy.get("password") or raw_proxy.get("pass") or ""
        if host and port:
            try:
                return {
                    "scheme": str(scheme).lower(),
                    "hostname": str(host).strip(),
                    "port": int(port),
                    "username": str(user).strip(),
                    "password": str(pwd).strip()
                }
            except Exception:
                pass
        return None

    # Если передан список или кортеж (типичный формат Telethon / PSSOFT / бирж)
    if isinstance(raw_proxy, (list, tuple)):
        try:
            if len(raw_proxy) >= 3:
                proto_raw = raw_proxy[0]
                scheme = "socks5"
                if proto_raw in (2, "socks5", "SOCKS5"):
                    scheme = "socks5"
                elif proto_raw in (1, "socks4", "SOCKS4"):
                    scheme = "socks4"
                elif proto_raw in (3, "http", "HTTP", "https", "HTTPS"):
                    scheme = "http"

                host = raw_proxy[1]
                port = raw_proxy[2]
                user = ""
                pwd = ""
                if len(raw_proxy) >= 6:
                    user = raw_proxy[4] or ""
                    pwd = raw_proxy[5] or ""
                elif len(raw_proxy) == 5:
                    user = raw_proxy[3] or ""
                    pwd = raw_proxy[4] or ""
                elif len(raw_proxy) == 4:
                    host = raw_proxy[0]
                    port = raw_proxy[1]
                    user = raw_proxy[2] or ""
                    pwd = raw_proxy[3] or ""

                if host and port:
                    return {
                        "scheme": scheme,
                        "hostname": str(host).strip(),
                        "port": int(port),
                        "username": str(user).strip() if user else "",
                        "password": str(pwd).strip() if pwd else ""
                    }
        except Exception:
            pass

    # Если строка
    if isinstance(raw_proxy, str):
        proxy_str = raw_proxy.strip()
        if "://" in proxy_str:
            try:
                parsed = urllib.parse.urlparse(proxy_str)
                return {
                    "scheme": parsed.scheme or "socks5",
                    "hostname": parsed.hostname,
                    "port": int(parsed.port) if parsed.port else 1080,
                    "username": parsed.username or "",
                    "password": parsed.password or ""
                }
            except Exception:
                pass
        parts = proxy_str.split(":")
        if len(parts) >= 4:
            try:
                return {
                    "scheme": "socks5",
                    "hostname": parts[0].strip(),
                    "port": int(parts[1]),
                    "username": parts[2].strip(),
                    "password": parts[3].strip()
                }
            except Exception:
                pass
        elif len(parts) == 2:
            try:
                return {
                    "scheme": "socks5",
                    "hostname": parts[0].strip(),
                    "port": int(parts[1]),
                    "username": "",
                    "password": ""
                }
            except Exception:
                pass

    return None

def parse_proxy_string(proxy_str):
    return normalize_proxy(proxy_str)

API_ID = _get_int("api_id", 36991700)
API_HASH = os.environ.get("API_HASH") or _config.get("api_hash") or "4473427b9db63e8278e91803de929d99"

from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            try:
                self.active_connections.remove(websocket)
            except ValueError:
                pass

    async def broadcast(self, message: dict):
        conns = list(self.active_connections)
        dead = []
        for connection in conns:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        
        if dead:
            for d in dead:
                if d in self.active_connections:
                    try:
                        self.active_connections.remove(d)
                    except ValueError:
                        pass

manager = ConnectionManager()


async def start_single_client(
    account_name: str,
    proxy_id: Optional[int] = None,
    custom_profile: Optional[Dict[str, Any]] = None,
    work_group_id: Optional[int] = None
) -> Tuple[bool, Optional[Client], str]:
    """
    Универсальный запуск одного аккаунта (как при старте фермы, так и на лету).
    1. Проверяет и мигрирует сессию (Telethon -> Pyrogram) при необходимости.
    2. Загружает или замораживает профиль устройства в {account_name}.json.
    3. Подтягивает прокси (из proxy_id, farm.db или seller .json).
    4. Подключает клиент, инициализирует, добавляет в clients и accounts_cache.
    5. Безопасен: при фатальной ошибке перемещает в карантин, при сетевом сбое сохраняет.
    """
    session_file = SESSIONS_DIR / f"{account_name}.session"
    if not session_file.exists():
        return False, None, f"Файл сессии {session_file.name} не найден"

    # 1. Автолечение / миграция сессии (Telethon -> Pyrogram / PSSOFT фикс)
    ok_migrated, mig_msg = detect_and_migrate_session(session_file, default_api_id=API_ID)
    if not ok_migrated:
        logger.warning(f"Не удалось проверить/мигрировать {account_name}: {mig_msg}")

    # 2. Профиль устройства: считываем замороженный или создаём постоянный
    fp = read_device_fingerprint(account_name)
    if not fp:
        profile = custom_profile or get_random_profile()
        freeze_device_profile(session_name=account_name, profile_data=profile)
        fp = profile

    current_api_id = fp.get("app_id") or fp.get("api_id") or API_ID
    current_api_hash = fp.get("app_hash") or fp.get("api_hash") or API_HASH
    device_model = fp.get("device_model") or fp.get("device") or fp.get("device_name") or fp.get("model") or "Samsung Galaxy S24 Ultra"
    system_version = str(fp.get("system_version") or fp.get("sdk") or fp.get("os_version") or "14")
    app_version = str(fp.get("app_version") or fp.get("version") or fp.get("app_v") or "10.6.0")
    lang_code = fp.get("lang_code") or fp.get("language") or "ru"
    system_lang_code = fp.get("system_lang_code") or fp.get("system_lang") or fp.get("system_language") or "ru-RU"

    # 3. Привязка прокси
    parsed_proxy = None
    target_proxy_id = proxy_id

    from database import get_db
    async with get_db() as db:
        if target_proxy_id is not None or work_group_id is not None:
            if target_proxy_id is not None and work_group_id is not None:
                await db.execute(
                    "INSERT INTO accounts (name, proxy_id, work_group_id) VALUES (?, ?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET proxy_id = excluded.proxy_id, work_group_id = excluded.work_group_id",
                    (account_name, target_proxy_id, work_group_id)
                )
            elif target_proxy_id is not None:
                await db.execute(
                    "INSERT INTO accounts (name, proxy_id) VALUES (?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET proxy_id = excluded.proxy_id",
                    (account_name, target_proxy_id)
                )
            elif work_group_id is not None:
                await db.execute(
                    "INSERT INTO accounts (name, work_group_id) VALUES (?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET work_group_id = excluded.work_group_id",
                    (account_name, work_group_id)
                )
            await db.commit()
        else:
            # Ищем существующий proxy_id в базе
            cursor = await db.execute("SELECT proxy_id FROM accounts WHERE name = ?", (account_name,))
            row = await cursor.fetchone()
            if row and row[0]:
                target_proxy_id = row[0]

        if target_proxy_id:
            cursor = await db.execute(
                "SELECT host, port, username, password FROM proxies WHERE id = ?",
                (target_proxy_id,)
            )
            prow = await cursor.fetchone()
            if prow:
                parsed_proxy = {
                    "scheme": "socks5",
                    "hostname": prow[0],
                    "port": prow[1],
                    "username": prow[2] or "",
                    "password": prow[3] or ""
                }

    # Если в базе прокси не найден, но в .json есть прокси продавца
    if not parsed_proxy and fp.get("proxy"):
        parsed_proxy = normalize_proxy(fp["proxy"])

    # 4. Проверяем, не запущен ли уже
    async with clients_lock:
        existing = next((c for c in clients if c.name == account_name), None)
        if existing and getattr(existing, "is_connected", False):
            clients_dict[account_name] = existing
            return True, existing, "Аккаунт уже подключен и активен"

    # 5. Создаём Pyrogram клиент
    client = make_client(
        account_name,
        current_api_id,
        current_api_hash,
        device_model=device_model,
        system_version=system_version,
        app_version=app_version,
        lang_code=lang_code,
        system_lang_code=system_lang_code,
        proxy=parsed_proxy
    )

    # 6. Подключаем и проверяем авторизацию
    try:
        is_authorized = await client.connect()
        if not is_authorized:
            try:
                if client.is_connected:
                    await client.disconnect()
            except Exception:
                pass
            try:
                if hasattr(client.storage, "close"):
                    res = client.storage.close()
                    if asyncio.iscoroutine(res):
                        await res
            except Exception:
                pass
            safe_quarantine_session(account_name, reason="Сессия не авторизована (SessionRevoked)")
            msg = "Сессия не авторизована в Telegram (отозвана или заморожена)"
            account_errors[account_name] = msg
            return False, None, msg

        await client.initialize()
    except Exception as error:
        err_name = type(error).__name__
        logger.error(f"Не удалось запустить клиент {account_name}: {err_name} ({error})")
        try:
            if getattr(client, "is_connected", False):
                await client.disconnect()
        except Exception:
            pass
        try:
            if hasattr(client.storage, "close"):
                res = client.storage.close()
                if asyncio.iscoroutine(res):
                    await res
        except Exception:
            pass

        # Только фатальные ошибки MTProto отправляют в карантин
        if err_name in ("AuthKeyUnregistered", "SessionExpired", "UserDeactivated", "Unauthorized"):
            safe_quarantine_session(account_name, reason=f"MTProto фатальная ошибка: {err_name}")
            msg = f"Ошибка авторизации ({err_name}). Сессия помещена в карантин."
            account_errors[account_name] = msg
            return False, None, msg

        msg = f"Сетевая ошибка или проблема с прокси: {error}. Файлы сохранены."
        account_errors[account_name] = msg
        return False, None, msg

    # 7. Добавляем в общий список
    async with clients_lock:
        clients[:] = [c for c in clients if c.name != account_name]
        clients.append(client)
        clients_dict[account_name] = client

    account_errors.pop(account_name, None)

    # 8. Синхронизируем кэш аккаунтов
    rec = await _account_record(client)
    if rec:
        _upsert_account(rec)
        from database import get_db
        async with get_db() as db:
            await db.execute(
                "INSERT INTO accounts (name, phone, proxy_id, device_fingerprint) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(name) DO UPDATE SET phone = excluded.phone, proxy_id = COALESCE(excluded.proxy_id, accounts.proxy_id), device_fingerprint = excluded.device_fingerprint",
                (client.name, rec.get("phone", ""), target_proxy_id, json.dumps(fp, ensure_ascii=False))
            )
            await db.commit()

    # 9. Оповещаем фронтенд через WebSocket
    try:
        await manager.broadcast({"type": "accounts_updated", "account": account_name})
    except Exception:
        pass

    logger.info(f"Аккаунт {account_name} успешно запущен на лету!")
    return True, client, "Аккаунт успешно запущен"


async def allocate_proxies_to_accounts(
    account_names: List[str],
    proxy_group_id: Optional[int],
    accounts_per_proxy: int = 1,
    work_group_id: Optional[int] = None
) -> Dict[str, Optional[int]]:
    """
    Умный аллокатор прокси из пула (proxy_group_id) на массив аккаунтов.
    accounts_per_proxy: сколько аккаунтов сажать на один прокси (1:1, 2:1, 3:1...).
    Сохраняет привязку в базе данных ДО первого соединения клиента.
    Возвращает словарь {account_name: assigned_proxy_id}.
    """
    mapping: Dict[str, Optional[int]] = {}
    if not account_names:
        return mapping

    accounts_per_proxy = max(1, int(accounts_per_proxy or 1))

    from database import get_db
    async with get_db() as db:
        proxies_pool = []
        if proxy_group_id is not None:
            cursor = await db.execute(
                "SELECT id, host, port, status FROM proxies WHERE proxy_group_id = ? ORDER BY CASE WHEN status = 'working' THEN 0 ELSE 1 END, id ASC",
                (proxy_group_id,)
            )
            proxies_pool = await cursor.fetchall()

        if not proxies_pool:
            # Если в группе нет прокси, просто сохраняем привязку к группе фермы (если указана)
            for acc in account_names:
                mapping[acc] = None
                if work_group_id is not None:
                    await db.execute(
                        "INSERT INTO accounts (name, work_group_id) VALUES (?, ?) "
                        "ON CONFLICT(name) DO UPDATE SET work_group_id = excluded.work_group_id",
                        (acc, work_group_id)
                    )
            await db.commit()
            return mapping

        num_proxies = len(proxies_pool)
        for idx, acc in enumerate(account_names):
            proxy_idx = (idx // accounts_per_proxy) % num_proxies
            assigned_id = proxies_pool[proxy_idx][0]
            mapping[acc] = assigned_id

            if work_group_id is not None:
                await db.execute(
                    "INSERT INTO accounts (name, proxy_id, work_group_id) VALUES (?, ?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET proxy_id = excluded.proxy_id, work_group_id = excluded.work_group_id",
                    (acc, assigned_id, work_group_id)
                )
            else:
                await db.execute(
                    "INSERT INTO accounts (name, proxy_id) VALUES (?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET proxy_id = excluded.proxy_id",
                    (acc, assigned_id)
                )

        await db.commit()

    return mapping

