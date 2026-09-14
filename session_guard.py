import os
import shutil
import sqlite3
import json
import time
import zipfile
import io
import re
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any
from logger import logger

BASE_DIR = Path(__file__).resolve().parent
SESSIONS_DIR = BASE_DIR / "sessions"
REVOKED_DIR = SESSIONS_DIR / "revoked"

# Схема Pyrogram SQLite Storage (Версия 3)
PYROGRAM_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions
(
    dc_id     INTEGER PRIMARY KEY,
    api_id    INTEGER,
    test_mode INTEGER,
    auth_key  BLOB,
    date      INTEGER NOT NULL,
    user_id   INTEGER,
    is_bot    INTEGER
);

CREATE TABLE IF NOT EXISTS peers
(
    id             INTEGER PRIMARY KEY,
    access_hash    INTEGER,
    type           INTEGER NOT NULL,
    username       TEXT,
    phone_number   TEXT,
    last_update_on INTEGER NOT NULL DEFAULT (CAST(STRFTIME('%s', 'now') AS INTEGER))
);

CREATE TABLE IF NOT EXISTS version
(
    number INTEGER PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_peers_id ON peers (id);
CREATE INDEX IF NOT EXISTS idx_peers_username ON peers (username);
CREATE INDEX IF NOT EXISTS idx_peers_phone_number ON peers (phone_number);

CREATE TRIGGER IF NOT EXISTS trg_peers_last_update_on
    AFTER UPDATE
    ON peers
BEGIN
    UPDATE peers
    SET last_update_on = CAST(STRFTIME('%s', 'now') AS INTEGER)
    WHERE id = NEW.id;
END;
"""


def detect_and_migrate_session(session_path: str | Path, default_api_id: int = 36991700) -> Tuple[bool, str]:
    """
    Проверяет структуру SQLite-файла сессии.
    1. Создаёт резервную копию .bak перед любыми изменениями.
    2. Если сессия от Telethon (в т.ч. с >5 колонок из PSSOFT), безопасно конвертирует
       её в нативный формат Pyrogram с сохранением оригинального MTProto auth_key и dc_id.
    3. Если сессия от Pyrogram, проверяет целостность схемы (version=3, peers, trigger).
    """
    path = Path(session_path)
    if not path.exists() or path.stat().st_size == 0:
        return False, "Файл сессии не существует или пуст"

    # Создаём резервную копию, если её еще нет
    bak_path = path.with_suffix(".session.bak")
    if not bak_path.exists():
        try:
            shutil.copy2(path, bak_path)
        except Exception as e:
            logger.warning(f"Не удалось создать бэкап {path.name}: {e}")

    try:
        conn = sqlite3.connect(str(path))
        cur = conn.cursor()

        # Проверяем существующие таблицы
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cur.fetchall()]

        if "sessions" not in tables:
            conn.close()
            return False, "Таблица 'sessions' отсутствует в файле"

        cur.execute("PRAGMA table_info(sessions)")
        columns = [row[1] for row in cur.fetchall()]

        # === Случай 1: Сессия от Telethon (есть колонка server_address) ===
        if "server_address" in columns:
            logger.info(f"Обнаружен формат Telethon в {path.name} (колонок: {len(columns)}). Конвертируем в Pyrogram...")
            
            # Извлекаем dc_id и auth_key
            cur.execute("SELECT * FROM sessions LIMIT 1")
            row = cur.fetchone()
            if not row:
                conn.close()
                return False, "Таблица sessions пуста"

            # В Telethon первые 4 колонки: (dc_id, server_address, port, auth_key, ...)
            dc_id = row[0]
            auth_key = row[3]

            if not auth_key or len(auth_key) != 256:
                conn.close()
                return False, f"Некорректный auth_key (длина {len(auth_key) if auth_key else 0}, ожидалось 256)"

            # Пересобираем схему под Pyrogram
            cur.execute("DROP TABLE sessions")
            cur.executescript(PYROGRAM_SCHEMA)

            # Обновляем версию до 3
            cur.execute("DELETE FROM version")
            cur.execute("INSERT INTO version VALUES (3)")

            # Вставляем сконвертированную сессию
            cur.execute(
                "INSERT INTO sessions (dc_id, api_id, test_mode, auth_key, date, user_id, is_bot) VALUES (?, ?, 0, ?, ?, 0, 0)",
                (dc_id, default_api_id, auth_key, int(time.time()))
            )
            conn.commit()
            conn.close()
            logger.info(f"Сессия {path.name} успешно сконвертирована из Telethon в Pyrogram!")
            return True, "converted_from_telethon"

        # === Случай 2: Сессия от Pyrogram ===
        if "auth_key" in columns:
            # Убеждаемся, что есть все таблицы и триггеры
            cur.executescript(PYROGRAM_SCHEMA)

            # Проверяем таблицу version
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='version'")
            if not cur.fetchone():
                cur.execute("CREATE TABLE version (number INTEGER PRIMARY KEY)")
                cur.execute("INSERT INTO version VALUES (3)")
            else:
                cur.execute("SELECT number FROM version")
                v_row = cur.fetchone()
                if not v_row or v_row[0] != 3:
                    cur.execute("DELETE FROM version")
                    cur.execute("INSERT INTO version VALUES (3)")

            conn.commit()
            conn.close()
            return True, "verified_pyrogram"

        conn.close()
        return False, f"Неизвестный формат сессии: колонки {columns}"

    except Exception as e:
        logger.error(f"Ошибка миграции сессии {path.name}: {e}")
        return False, str(e)


def freeze_device_profile(
    session_name: str,
    profile_data: Dict[str, Any],
    phone: Optional[str] = None,
    proxy_dict: Optional[Dict[str, Any]] = None,
    two_fa: Optional[str] = None
) -> Path:
    """
    Создаёт и навсегда замораживает цифровой отпечаток устройства в {session_name}.json.
    Сохраняет точную модель телефона, версию ОС, Telegram app_version, язык, api_id,
    привязанный прокси и 2FA пароль.
    """
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    json_path = SESSIONS_DIR / f"{session_name}.json"

    # Если файл уже существовал, дополняем новыми полями без потери старых
    existing_data = {}
    if json_path.exists():
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception:
            pass

    # Формируем эталонный отпечаток
    final_data = {
        "session_file": session_name,
        "phone": phone or existing_data.get("phone") or session_name,
        "app_id": profile_data.get("api_id") or profile_data.get("app_id") or existing_data.get("app_id") or 36991700,
        "app_hash": profile_data.get("api_hash") or profile_data.get("app_hash") or existing_data.get("app_hash") or "4473427b9db63e8278e91803de929d99",
        "device_model": profile_data.get("device_model") or existing_data.get("device_model") or "Samsung Galaxy S24 Ultra",
        "system_version": profile_data.get("system_version") or existing_data.get("system_version") or "14",
        "app_version": profile_data.get("app_version") or existing_data.get("app_version") or "10.6.0",
        "lang_code": profile_data.get("lang_code") or existing_data.get("lang_code") or "ru",
        "system_lang_code": profile_data.get("system_lang_code") or existing_data.get("system_lang_code") or "ru-RU",
        "twoFA": two_fa if two_fa is not None else existing_data.get("twoFA"),
        "created_at": existing_data.get("created_at") or int(time.time()),
        "last_updated": int(time.time()),
    }

    if proxy_dict:
        final_data["proxy"] = proxy_dict
    elif "proxy" in existing_data:
        final_data["proxy"] = existing_data["proxy"]

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(final_data, f, indent=4, ensure_ascii=False)

    logger.info(f"Цифровой отпечаток для {session_name} успешно заморожен в {json_path.name}")
    return json_path


def read_device_fingerprint(session_name: str) -> Optional[Dict[str, Any]]:
    """Читает сохранённый профиль устройства из {session_name}.json"""
    json_path = SESSIONS_DIR / f"{session_name}.json"
    if not json_path.exists():
        return None
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Не удалось прочитать {json_path.name}: {e}")
        return None


def safe_quarantine_session(session_name: str, reason: str = "unauthorized") -> bool:
    """
    БЕЗОПАСНЫЙ КАРАНТИН ВМЕСТО УДАЛЕНИЯ!
    Перемещает файлы сессии в папку sessions/revoked/ и сохраняет лог с причиной.
    Пользователь всегда может проверить или восстановить купленный аккаунт.
    """
    REVOKED_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = int(time.time())
    moved_any = False

    extensions = [".session", ".json", ".session-journal", ".session-wal", ".session-shm", ".session.bak"]
    for ext in extensions:
        src = SESSIONS_DIR / f"{session_name}{ext}"
        if src.exists():
            dst = REVOKED_DIR / f"{session_name}_{timestamp}{ext}"
            try:
                shutil.move(str(src), str(dst))
                moved_any = True
            except Exception as e:
                logger.error(f"Не удалось переместить в карантин {src.name}: {e}")

    # Записываем в лог причину
    log_file = REVOKED_DIR / "quarantine_history.json"
    history = []
    if log_file.exists():
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                history = json.load(f)
        except Exception:
            history = []

    history.append({
        "session_name": session_name,
        "timestamp": timestamp,
        "time_str": time.strftime("%Y-%m-%d %H:%M:%S"),
        "reason": reason
    })

    try:
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
    except Exception:
        pass

    logger.warning(f"Сессия {session_name} помещена в карантин. Причина: {reason}")
    return moved_any


def extract_session_archive(zip_bytes_or_path: bytes | Path | str, target_dir: Path = SESSIONS_DIR) -> List[str]:
    """
    Распаковывает zip-архив с сессиями.
    Находит все пары .session и .json независимо от вложенности папок и сохраняет в target_dir.
    Возвращает список имён обнаруженных сессий (без расширений).
    """
    target_dir.mkdir(parents=True, exist_ok=True)
    discovered_sessions = set()

    if isinstance(zip_bytes_or_path, (bytes, bytearray)):
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes_or_path))
    else:
        zf = zipfile.ZipFile(str(zip_bytes_or_path))

    with zf:
        for file_info in zf.infolist():
            if file_info.is_dir():
                continue

            raw_name = Path(file_info.filename).name
            if not raw_name:
                continue

            # Игнорируем системные файлы macOS/Windows
            if raw_name.startswith("__MACOSX") or raw_name.startswith("._") or raw_name.startswith("."):
                continue

            ext = os.path.splitext(raw_name)[1].lower()
            if ext in [".session", ".json"]:
                # Очищаем имя от спецсимволов, оставляя только цифры, буквы, _ и -
                base_name = os.path.splitext(raw_name)[0]
                safe_base = re.sub(r"[^\w\-]", "", base_name)
                if not safe_base:
                    safe_base = f"imported_{int(time.time())}"

                dest_file = target_dir / f"{safe_base}{ext}"
                with zf.open(file_info) as source, open(dest_file, "wb") as target:
                    shutil.copyfileobj(source, target)

                if ext == ".session":
                    discovered_sessions.add(safe_base)

    return list(discovered_sessions)
