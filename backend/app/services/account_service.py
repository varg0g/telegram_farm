import os
import shutil
import time
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from app.core.config import SESSIONS_DIR
from app.core.logger import logger
from app.db.database import db
from app.telegram.client_manager import client_manager

async def get_all_accounts() -> List[Dict[str, Any]]:
    """
    Возвращает расширенный список всех аккаунтов со статусами, прокси и рабочими группами.
    """
    # 1. Сканируем файлы сессий на диске
    session_files = {f.stem for f in SESSIONS_DIR.glob("*.session")}
    
    # 2. Достаем все записи из БД
    sql = """
        SELECT a.*, wg.title as group_title, wg.color as group_color,
               p.host as proxy_host, p.port as proxy_port, p.proto as proxy_proto, p.status as proxy_status
        FROM accounts a
        LEFT JOIN work_groups wg ON a.work_group_id = wg.id
        LEFT JOIN proxies p ON a.proxy_id = p.id
    """
    db_accounts = await db.fetch_all(sql)
    db_map = {row["session_name"]: row for row in db_accounts}
    
    # 3. Пакетно считаем общее количество непрочитанных сообщений по всем аккаунтам за 1 быстрый запрос
    unread_rows = await db.fetch_all(
        "SELECT account_phone, SUM(unread_count) as total_unread FROM dialogs GROUP BY account_phone"
    )
    unread_map = {}
    for r in unread_rows:
        acc_p = str(r["account_phone"]) if r["account_phone"] else ""
        cnt = r["total_unread"] or 0
        unread_map[acc_p] = cnt
        unread_map[acc_p.lstrip("+")] = cnt

    # Объединяем файлы на диске и записи в БД
    all_names = sorted(session_files.union(db_map.keys()))
    result = []
    
    for name in all_names:
        row = db_map.get(name)
        client = client_manager.get_client(name)
        is_active = client is not None and client.is_connected()
        
        status = "active" if is_active else (row["status"] if row else "offline")
        phone = (row["phone"] if row and row.get("phone") else name)
        
        total_unread = unread_map.get(str(phone), unread_map.get(str(phone).lstrip("+"), 0))
        
        acc_dict = {
            "id": row["id"] if row else 0,
            "session_name": name,
            "phone": phone,
            "first_name": row["first_name"] if row else "",
            "last_name": row["last_name"] if row else "",
            "username": row["username"] if row else "",
            "user_id": row["user_id"] if row else 0,
            "work_group_id": row["work_group_id"] if row else None,
            "group_title": row["group_title"] if row else None,
            "group_color": row["group_color"] if row else None,
            "proxy_id": row["proxy_id"] if row else None,
            "proxy_str": f"{row['proxy_proto']}://{row['proxy_host']}:{row['proxy_port']}" if row and row.get("proxy_host") else None,
            "proxy_status": row["proxy_status"] if row else None,
            "status": status,
            "status_detail": row["status_detail"] if row else "",
            "total_unread": total_unread,
            "last_active_at": row["last_active_at"] if row else None
        }
        result.append(acc_dict)
        
    return result

async def save_uploaded_session(session_bytes: bytes, filename: str, json_bytes: Optional[bytes] = None) -> Tuple[bool, str]:
    """Сохраняет загруженные файлы .session и .json и регистрирует аккаунт."""
    base_name = Path(filename).stem
    sess_path = SESSIONS_DIR / f"{base_name}.session"
    
    with open(sess_path, "wb") as f:
        f.write(session_bytes)
        
    if json_bytes:
        json_path = SESSIONS_DIR / f"{base_name}.json"
        with open(json_path, "wb") as f:
            f.write(json_bytes)
            
    # Запуск аккаунта в фоне
    success, msg = await client_manager.start_account(base_name)
    return success, msg

async def delete_account(session_name: str) -> bool:
    """Удаляет сессию, останавливает клиент и очищает базу."""
    base_name = Path(session_name).stem
    client = client_manager.get_client(base_name)
    if client:
        try:
            await client.disconnect()
        except Exception:
            pass
        client_manager.clients.pop(base_name, None)
        
    sess_path = SESSIONS_DIR / f"{base_name}.session"
    json_path = SESSIONS_DIR / f"{base_name}.json"
    if sess_path.exists():
        sess_path.unlink()
    if json_path.exists():
        json_path.unlink()
        
    await db.execute("DELETE FROM accounts WHERE session_name = ? OR phone = ?", (base_name, base_name))
    await db.execute("DELETE FROM dialogs WHERE account_phone = ?", (base_name,))
    await db.execute("DELETE FROM messages WHERE account_phone = ?", (base_name,))
    return True

async def bind_proxy_to_account(session_name: str, proxy_id: Optional[int]) -> bool:
    """Привязывает прокси к аккаунту и при необходимости перезапускает его."""
    base_name = Path(session_name).stem
    await db.execute("UPDATE accounts SET proxy_id = ? WHERE session_name = ? OR phone = ?", (proxy_id, base_name, base_name))
    
    # Если аккаунт уже был запущен - перезапускаем его с новым прокси
    client = client_manager.get_client(base_name)
    if client and client.is_connected():
        await client_manager.start_account(base_name, force=True)
    return True

async def bind_group_to_account(session_name: str, group_id: Optional[int]) -> bool:
    """Назначает рабочую группу для аккаунта."""
    base_name = Path(session_name).stem
    await db.execute("UPDATE accounts SET work_group_id = ? WHERE session_name = ? OR phone = ?", (group_id, base_name, base_name))
    return True
