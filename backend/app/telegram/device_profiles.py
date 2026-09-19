import random
from typing import Dict, Any, Optional

# Официальные пары API Telegram
OFFICIAL_PROFILES = {
    "desktop_win": {
        "api_id": 2040,
        "api_hash": "b18441a1ff607e10a989891a5462e627",
        "device_model": "Desktop",
        "system_version": "Windows 11",
        "app_version": "5.2.2",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "desktop_mac": {
        "api_id": 2040,
        "api_hash": "b18441a1ff607e10a989891a5462e627",
        "device_model": "MacBook Pro",
        "system_version": "macOS 14.5",
        "app_version": "5.2.2",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "android_samsung": {
        "api_id": 6,
        "api_hash": "eb06d4abfb49dc3eeb1aeb98ae0f581e",
        "device_model": "Samsung Galaxy S24 Ultra",
        "system_version": "SDK 34 (Android 14)",
        "app_version": "10.14.5 (4922)",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "android_xiaomi": {
        "api_id": 6,
        "api_hash": "eb06d4abfb49dc3eeb1aeb98ae0f581e",
        "device_model": "Xiaomi 13 Pro",
        "system_version": "SDK 34 (Android 14)",
        "app_version": "10.14.5 (4922)",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "android_pixel": {
        "api_id": 6,
        "api_hash": "eb06d4abfb49dc3eeb1aeb98ae0f581e",
        "device_model": "Google Pixel 8 Pro",
        "system_version": "SDK 34 (Android 14)",
        "app_version": "10.14.5 (4922)",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    },
    "ios_iphone15": {
        "api_id": 10840,
        "api_hash": "b80e42773219485775f0a07e15d863f8",
        "device_model": "iPhone 15 Pro Max",
        "system_version": "iOS 17.5.1",
        "app_version": "10.14.1",
        "lang_code": "ru",
        "system_lang_code": "ru-RU"
    }
}

def get_random_mobile_profile() -> Dict[str, Any]:
    """Возвращает случайный профиль реального смартфона для авторизации по номеру."""
    choices = ["android_samsung", "android_xiaomi", "android_pixel", "ios_iphone15"]
    key = random.choice(choices)
    return dict(OFFICIAL_PROFILES[key])

def resolve_device_profile(json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Принимает словарь из .json файла сессии (если есть) или возвращает дефолтный профиль.
    Проверяет валидность api_id и подставляет недостающие параметры.
    """
    if not json_data:
        return dict(OFFICIAL_PROFILES["desktop_win"])

    api_id = json_data.get("api_id") or json_data.get("app_id")
    api_hash = json_data.get("api_hash") or json_data.get("app_hash")

    # Если api_id или api_hash отсутствуют, берем официальный Desktop
    if not api_id or not api_hash:
        api_id = OFFICIAL_PROFILES["desktop_win"]["api_id"]
        api_hash = OFFICIAL_PROFILES["desktop_win"]["api_hash"]

    device_model = json_data.get("device_model") or json_data.get("device") or "Desktop"
    system_version = json_data.get("system_version") or json_data.get("sdk") or "Windows 11"
    app_version = json_data.get("app_version") or "5.2.2"
    lang_code = json_data.get("lang_code") or "ru"
    system_lang_code = json_data.get("system_lang_code") or "ru-RU"

    return {
        "api_id": int(api_id),
        "api_hash": str(api_hash).strip(),
        "device_model": str(device_model).strip(),
        "system_version": str(system_version).strip(),
        "app_version": str(app_version).strip(),
        "lang_code": str(lang_code).strip(),
        "system_lang_code": str(system_lang_code).strip()
    }
