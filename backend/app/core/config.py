from pathlib import Path
import os
import json
import secrets

# Корневые директории
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
BASE_DIR = BACKEND_DIR
SESSIONS_DIR = BACKEND_DIR / "sessions"
DATA_DIR = BACKEND_DIR / "data"
MEDIA_DIR = DATA_DIR / "media"
AVATARS_DIR = DATA_DIR / "avatars"
UPLOADS_DIR = BACKEND_DIR / "uploads"
CONFIG_FILE = BACKEND_DIR / "config.json"

for d in [SESSIONS_DIR, DATA_DIR, MEDIA_DIR, AVATARS_DIR, UPLOADS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Официальные пары API Telegram
OFFICIAL_APPS = {
    "desktop": {
        "api_id": 2040,
        "api_hash": "b18441a1ff607e10a989891a5462e627",
        "device_model": "Desktop",
        "system_version": "Windows 11",
        "app_version": "5.2.2",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "android": {
        "api_id": 6,
        "api_hash": "eb06d4abfb49dc3eeb1aeb98ae0f581e",
        "device_model": "Samsung Galaxy S24 Ultra",
        "system_version": "SDK 34 (Android 14)",
        "app_version": "10.14.5 (4922)",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "ios": {
        "api_id": 10840,
        "api_hash": "b80e42773219485775f0a07e15d863f8",
        "device_model": "iPhone 15 Pro",
        "system_version": "iOS 17.5.1",
        "app_version": "10.14.1",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    }
}

class Settings:
    PROJECT_NAME: str = "Telegram Farm CRM v2"
    VERSION: str = "2.0.0"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # Секретный ключ для сессий
    SECRET_KEY: str = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
    AUTH_REQUIRED: bool = os.getenv("AUTH_REQUIRED", "false").lower() in ("true", "1")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
    SESSION_COOKIE_NAME: str = "tg_crm_session"
    CSRF_COOKIE_NAME: str = "tg_crm_csrf"
    
    # Дефолтный клиент для подключения
    DEFAULT_API_ID: int = OFFICIAL_APPS["desktop"]["api_id"]
    DEFAULT_API_HASH: str = OFFICIAL_APPS["desktop"]["api_hash"]
    
    # База данных
    DB_PATH: Path = DATA_DIR / "crm.db"

settings = Settings()
