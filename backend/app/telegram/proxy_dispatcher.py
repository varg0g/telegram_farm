import asyncio
from typing import Optional, Dict, Any, Tuple
import aiohttp
from aiohttp_socks import ProxyConnector
from app.core.logger import logger

def build_telethon_proxy(proxy_dict: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Формирует словарь конфигурации прокси для Telethon (через python-socks).
    """
    if not proxy_dict or not proxy_dict.get("host"):
        return None

    proto = proxy_dict.get("proto", "socks5").lower()
    if proto not in ["socks5", "socks4", "http"]:
        proto = "socks5"

    config = {
        "proxy_type": proto,
        "addr": str(proxy_dict["host"]).strip(),
        "port": int(proxy_dict["port"]),
        "rdns": True
    }

    if proxy_dict.get("username"):
        config["username"] = str(proxy_dict["username"]).strip()
    if proxy_dict.get("password"):
        config["password"] = str(proxy_dict["password"]).strip()

    return config

async def check_proxy_latency(host: str, port: int, proto: str = "socks5", username: str = None, password: str = None, timeout: float = 7.0) -> Tuple[bool, int, str]:
    """
    Проверяет доступность и замеряет пинг прокси (мс) через тестовый запрос к Telegram API.
    Возвращает (успех: bool, ping_ms: int, ошибка: str).
    """
    auth = ""
    if username and password:
        auth = f"{username}:{password}@"
    elif username:
        auth = f"{username}@"

    proxy_url = f"{proto}://{auth}{host}:{port}"
    start_time = asyncio.get_event_loop().time()

    try:
        connector = ProxyConnector.from_url(proxy_url)
        client_timeout = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
            # Делаем быстрый HEAD-запрос к официальному шлюзу Telegram
            async with session.get("https://api.telegram.org", allow_redirects=False) as resp:
                elapsed_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)
                return True, elapsed_ms, "OK"
    except Exception as e:
        elapsed_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)
        err_msg = str(e) or type(e).__name__
        return False, elapsed_ms, err_msg
