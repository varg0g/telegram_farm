import os
import json
import sqlite3
import base64
import struct
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from telethon.sessions import StringSession, SQLiteSession
from app.core.config import SESSIONS_DIR
from app.core.logger import logger
from app.telegram.device_profiles import resolve_device_profile

# Официальные адреса дата-центров Telegram
DC_ADDRESSES = {
    1: ("149.154.175.53", 443),
    2: ("149.154.167.51", 443),
    3: ("149.154.175.100", 443),
    4: ("149.154.167.91", 443),
    5: ("91.108.56.130", 443)
}

def inspect_session_file(session_path: Path) -> Tuple[str, Optional[Dict[str, Any]], str]:
    """
    Неразрушающий анализ файла сессии в режиме Read-Only.
    Возвращает:
      - format: 'telethon' | 'pyrogram' | 'corrupt' | 'empty'
      - raw_data: {'dc_id': int, 'auth_key': bytes, ...}
      - message: детали
    """
    if not session_path.exists() or session_path.stat().st_size == 0:
        return "empty", None, "Файл пуст или отсутствует"

    try:
        # Открываем строго в режиме Read-Only через URI
        uri = f"file:{session_path.resolve().as_posix()}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        cur = conn.cursor()

        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]

        if "sessions" not in tables:
            conn.close()
            return "corrupt", None, "Таблица 'sessions' отсутствует"

        cur.execute("PRAGMA table_info(sessions)")
        cols = [r[1] for r in cur.fetchall()]

        cur.execute("SELECT * FROM sessions LIMIT 1")
        row = cur.fetchone()
        conn.close()

        if not row:
            return "empty", None, "Таблица sessions пуста"

        # Telethon формат (содержит server_address)
        if "server_address" in cols:
            dc_id = row[0]
            server_address = row[1]
            port = row[2]
            auth_key = row[3]
            return "telethon", {
                "dc_id": dc_id,
                "server_address": server_address,
                "port": port,
                "auth_key": auth_key
            }, "Нативная сессия Telethon"

        # Pyrogram формат (содержит auth_key, но нет server_address)
        if "auth_key" in cols:
            dc_id = row[0]
            # В Pyrogram schema v3: dc_id, api_id, test_mode, auth_key, date, user_id, is_bot
            auth_key_idx = cols.index("auth_key")
            auth_key = row[auth_key_idx]
            return "pyrogram", {
                "dc_id": dc_id,
                "auth_key": auth_key
            }, "Сессия Pyrogram (поддерживается через StringSession)"

        return "unknown", None, f"Неизвестные колонки: {cols}"
    except Exception as e:
        logger.error(f"Ошибка чтения сессии {session_path.name}: {e}")
        return "corrupt", None, str(e)


def pyrogram_auth_key_to_string_session(dc_id: int, auth_key: bytes) -> str:
    """
    Конвертирует ключ Pyrogram в Telethon StringSession на лету в памяти,
    без перезаписи и повреждения исходного файла на диске!
    """
    ip, port = DC_ADDRESSES.get(dc_id, ("149.154.167.51", 443))
    ip_bytes = bytes(map(int, ip.split(".")))
    # Формат Telethon StringSession v1 для IPv4:
    # 1 byte (dc_id) + 4 bytes (IPv4) + 2 bytes (port, big-endian) + 256 bytes (auth_key)
    packed = struct.pack(">B4sH256s", dc_id, ip_bytes, port, auth_key)
    return "1" + base64.urlsafe_b64encode(packed).decode("ascii")


def load_session_credentials(session_name: str) -> Tuple[Any, Dict[str, Any]]:
    """
    Загружает сессию и параметры устройства.
    Возвращает:
      - session: имя файла SQLiteSession или объект StringSession
      - device_profile: словарь параметров для эмуляции устройства
    """
    base_name = session_name.replace(".session", "")
    session_file = SESSIONS_DIR / f"{base_name}.session"
    json_file = SESSIONS_DIR / f"{base_name}.json"

    # Считываем .json параметры устройства (если есть)
    device_json = None
    if json_file.exists():
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                device_json = json.load(f)
        except Exception as e:
            logger.warning(f"Не удалось прочитать {json_file.name}: {e}")

    profile = resolve_device_profile(device_json)

    # Инспектируем .session файл
    fmt, data, msg = inspect_session_file(session_file)

    if fmt == "telethon":
        # Нативный Telethon: передаём путь к файлу (Telethon сам управляет SQLiteSession)
        return str(session_file.with_suffix("")), profile
    elif fmt == "pyrogram" and data and data.get("auth_key"):
        # Pyrogram сессия: открываем через StringSession в памяти!
        # Исходный файл не меняется, нет риска локов или порчи.
        str_sess = pyrogram_auth_key_to_string_session(data["dc_id"], data["auth_key"])
        return StringSession(str_sess), profile
    else:
        # Дефолтный fallback
        return str(session_file.with_suffix("")), profile
