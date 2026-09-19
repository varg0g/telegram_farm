import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from app.db.database import db
from app.telegram.proxy_dispatcher import check_proxy_latency
from app.core.logger import logger

async def get_all_proxies(proxy_group_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Возвращает список прокси с количеством привязанных аккаунтов."""
    where = "WHERE p.proxy_group_id = ?" if proxy_group_id is not None else ""
    params = (proxy_group_id,) if proxy_group_id is not None else ()
    
    sql = f"""
        SELECT p.*, pg.title as group_title,
               COUNT(a.id) as linked_accounts_count
        FROM proxies p
        LEFT JOIN proxy_groups pg ON p.proxy_group_id = pg.id
        LEFT JOIN accounts a ON a.proxy_id = p.id
        {where}
        GROUP BY p.id
        ORDER BY p.id DESC
    """
    return await db.fetch_all(sql, params)

async def add_single_proxy(
    host: str,
    port: int,
    proto: str = "socks5",
    username: Optional[str] = None,
    password: Optional[str] = None,
    proxy_group_id: Optional[int] = None
) -> int:
    """Добавляет единичный прокси и сразу замеряет пинг."""
    ok, ping, err = await check_proxy_latency(host, port, proto, username, password)
    status = "active" if ok else "error"
    now = int(time.time())
    
    sql = """
        INSERT INTO proxies 
        (host, port, proto, username, password, proxy_group_id, status, ping_ms, last_checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    row_id = await db.execute(sql, (
        host.strip(), int(port), proto.lower(),
        username.strip() if username else None,
        password.strip() if password else None,
        proxy_group_id, status, ping, now
    ))
    return row_id

async def batch_add_proxies(lines: List[str], proxy_group_id: Optional[int] = None, default_proto: str = "socks5") -> int:
    """
    Массовый парсинг и импорт строк прокси в форматах:
      - host:port
      - host:port:user:pass
      - proto://user:pass@host:port
    """
    added_count = 0
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
            
        proto = default_proto
        username = None
        password = None
        
        # Если есть префикс proto://
        if "://" in line:
            proto, rest = line.split("://", 1)
            if "@" in rest:
                auth_part, host_part = rest.split("@", 1)
                if ":" in auth_part:
                    username, password = auth_part.split(":", 1)
                else:
                    username = auth_part
            else:
                host_part = rest
            if ":" in host_part:
                host, port_str = host_part.split(":", 1)
                port = int(port_str.split("/")[0])
            else:
                continue
        else:
            parts = line.split(":")
            if len(parts) == 2:
                host, port_str = parts
                port = int(port_str)
            elif len(parts) == 4:
                host, port_str, username, password = parts
                port = int(port_str)
            else:
                continue
                
        await add_single_proxy(host, port, proto, username, password, proxy_group_id)
        added_count += 1
        
    return added_count

async def check_single_proxy(proxy_id: int) -> Dict[str, Any]:
    """Проверяет задержку конкретного прокси."""
    p = await db.fetch_one("SELECT * FROM proxies WHERE id = ?", (proxy_id,))
    if not p:
        raise ValueError(f"Прокси с ID {proxy_id} не найден")
        
    ok, ping, err = await check_proxy_latency(
        p["host"], p["port"], p["proto"], p["username"], p["password"]
    )
    status = "active" if ok else "error"
    now = int(time.time())
    await db.execute("""
        UPDATE proxies SET status = ?, ping_ms = ?, last_checked_at = ? WHERE id = ?
    """, (status, ping, now, proxy_id))
    
    updated = await db.fetch_one("""
        SELECT p.*, pg.title as group_title, COUNT(a.id) as linked_accounts_count
        FROM proxies p
        LEFT JOIN proxy_groups pg ON p.proxy_group_id = pg.id
        LEFT JOIN accounts a ON a.proxy_id = p.id
        WHERE p.id = ?
        GROUP BY p.id
    """, (proxy_id,))
    return dict(updated or {})

async def check_all_proxies(proxy_group_id: Optional[Any] = None) -> Dict[str, Any]:
    """Массовая асинхронная проверка доступности всех прокси (или прокси выбранной группы)."""
    if proxy_group_id == "nogroup":
        proxies = await db.fetch_all("SELECT * FROM proxies WHERE proxy_group_id IS NULL")
    elif proxy_group_id is not None and str(proxy_group_id).isdigit():
        proxies = await db.fetch_all("SELECT * FROM proxies WHERE proxy_group_id = ?", (int(proxy_group_id),))
    else:
        proxies = await db.fetch_all("SELECT * FROM proxies")
        
    working_count = 0
    
    async def _check_one(p):
        nonlocal working_count
        ok, ping, err = await check_proxy_latency(
            p["host"], p["port"], p["proto"], p["username"], p["password"]
        )
        status = "active" if ok else "error"
        if ok:
            working_count += 1
        now = int(time.time())
        await db.execute("""
            UPDATE proxies SET status = ?, ping_ms = ?, last_checked_at = ? WHERE id = ?
        """, (status, ping, now, p["id"]))
        
    tasks = [_check_one(p) for p in proxies]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
        
    return {
        "status": "ok",
        "total": len(proxies),
        "working": working_count,
        "proxies": await get_all_proxies()
    }

async def move_proxies_to_group(proxy_ids: List[int], target_group_id: Optional[int]) -> int:
    """Перемещает список прокси в указанную группу (или делает без группы)."""
    if not proxy_ids:
        return 0
    placeholders = ",".join("?" for _ in proxy_ids)
    sql = f"UPDATE proxies SET proxy_group_id = ? WHERE id IN ({placeholders})"
    await db.execute(sql, (target_group_id, *proxy_ids))
    return len(proxy_ids)

async def rename_proxy_group(group_id: int, title: str) -> bool:
    """Переименовывает группу прокси."""
    await db.execute("UPDATE proxy_groups SET title = ? WHERE id = ?", (title.strip(), group_id))
    return True

async def assign_proxy_to_accounts(proxy_id: Optional[int], accounts: List[str]) -> bool:
    """Привязывает или отвязывает список аккаунтов от прокси."""
    acc_clean = [a.strip() for a in accounts if a.strip()]
    
    if not proxy_id or proxy_id == 0:
        # Отвязать указанные аккаунты
        if acc_clean:
            placeholders = ",".join("?" for _ in acc_clean)
            await db.execute(
                f"UPDATE accounts SET proxy_id = NULL WHERE session_name IN ({placeholders}) OR phone IN ({placeholders})",
                (*acc_clean, *acc_clean)
            )
        return True

    # 1. Отвязываем аккаунты, которые были привязаны к этому прокси, но теперь не выбраны
    if acc_clean:
        placeholders = ",".join("?" for _ in acc_clean)
        await db.execute(
            f"UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ? AND session_name NOT IN ({placeholders}) AND phone NOT IN ({placeholders})",
            (proxy_id, *acc_clean, *acc_clean)
        )
        # 2. Привязываем выбранные
        await db.execute(
            f"UPDATE accounts SET proxy_id = ? WHERE session_name IN ({placeholders}) OR phone IN ({placeholders})",
            (proxy_id, *acc_clean, *acc_clean)
        )
    else:
        # Если список пуст — отвязать все от этого прокси
        await db.execute("UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ?", (proxy_id,))
        
    return True

async def allocate_proxies_to_accounts(
    account_names: List[str],
    proxy_group_id: Optional[int],
    accounts_per_proxy: int = 1,
    work_group_id: Optional[int] = None
) -> Dict[str, Optional[int]]:
    """
    Равномерно распределяет прокси из пула на переданные аккаунты с заданным соотношением.
    """
    mapping: Dict[str, Optional[int]] = {}
    if not account_names:
        return mapping

    ratio = max(1, int(accounts_per_proxy or 1))
    
    if proxy_group_id is not None:
        proxies_pool = await db.fetch_all(
            "SELECT id, host, port, status FROM proxies WHERE proxy_group_id = ? ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC",
            (proxy_group_id,)
        )
    else:
        proxies_pool = await db.fetch_all(
            "SELECT id, host, port, status FROM proxies ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC"
        )

    if not proxies_pool:
        # Если пул пуст, просто привязываем группу фермы при необходимости
        for acc in account_names:
            mapping[acc] = None
            if work_group_id is not None:
                await db.execute(
                    "UPDATE accounts SET work_group_id = ? WHERE session_name = ? OR phone = ?",
                    (work_group_id, acc, acc)
                )
        return mapping

    num_proxies = len(proxies_pool)
    for idx, acc in enumerate(account_names):
        proxy_idx = (idx // ratio) % num_proxies
        assigned_id = proxies_pool[proxy_idx]["id"]
        mapping[acc] = assigned_id

        if work_group_id is not None:
            await db.execute(
                "UPDATE accounts SET proxy_id = ?, work_group_id = ? WHERE session_name = ? OR phone = ?",
                (assigned_id, work_group_id, acc, acc)
            )
        else:
            await db.execute(
                "UPDATE accounts SET proxy_id = ? WHERE session_name = ? OR phone = ?",
                (assigned_id, acc, acc)
            )

    return mapping

async def delete_proxy(proxy_id: int) -> bool:
    """Удаляет прокси и отвязывает от аккаунтов."""
    await db.execute("UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ?", (proxy_id,))
    await db.execute("DELETE FROM proxies WHERE id = ?", (proxy_id,))
    return True

async def get_proxy_groups() -> List[Dict[str, Any]]:
    """Возвращает список всех групп прокси со счётчиком серверов."""
    sql = """
        SELECT pg.*, 
               COUNT(p.id) as proxies_count,
               SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as working_count
        FROM proxy_groups pg
        LEFT JOIN proxies p ON p.proxy_group_id = pg.id
        GROUP BY pg.id
        ORDER BY pg.id ASC
    """
    return await db.fetch_all(sql)

async def create_proxy_group(title: str) -> int:
    now = int(time.time())
    return await db.execute("INSERT INTO proxy_groups (title, created_at) VALUES (?, ?)", (title.strip(), now))

async def delete_proxy_group(group_id: int) -> bool:
    await db.execute("UPDATE proxies SET proxy_group_id = NULL WHERE proxy_group_id = ?", (group_id,))
    await db.execute("DELETE FROM proxy_groups WHERE id = ?", (group_id,))
    return True
