from fastapi import APIRouter, Form, Depends
from fastapi.responses import JSONResponse
import aiosqlite
import os
from utils import clients, clients_lock, accounts_cache, dialog_caches, dialog_locks, SESSIONS_DIR, _get_client, clients_dict
from logger import logger
from database import get_db
from task_manager import task_manager

from utils import get_current_user # для защиты маршрута паролем

# Создаем сам роутер
groups_router = APIRouter()

@groups_router.post("/api/add_group")
async def add_group(title: str = Form(...), accounts: str = Form("")):
    async with get_db() as db:
        try:
            # 1. Вставляем новое название и сразу запоминаем ID новой группы
            cursor = await db.execute("INSERT INTO work_groups (title) VALUES (?)", (title,))
            group_id = cursor.lastrowid 

            # 2. Если пользователь выбрал аккаунты галочками, привязываем их
            if accounts:
                account_names = accounts.split(",")
                for acc_name in account_names:
                    name_clean = acc_name.strip()
                    update_cursor = await db.execute(
                        "UPDATE accounts SET work_group_id = ? WHERE name = ?", 
                        (group_id, name_clean)
                    )
                    if update_cursor.rowcount == 0:
                        await db.execute(
                            "INSERT INTO accounts (name, work_group_id) VALUES (?, ?)", 
                            (name_clean, group_id)
                        )
                    
            await db.commit()
            return JSONResponse({"ok": True, "message": "Группа успешно создана"})
        
        except aiosqlite.IntegrityError:
            return JSONResponse({"ok": False, "error": "Группа с таким названием уже существует"})

@groups_router.get("/api/groups")
async def get_groups():
    async with get_db() as db:
        cursor = await db.execute("SELECT id, title FROM work_groups")
        rows = await cursor.fetchall()
        groups = [{"id": row[0], "title": row[1]} for row in rows]
        return JSONResponse({"ok": True, "groups": groups})        

@groups_router.post("/api/delete_group")
async def delete_group(group_id: int = Form(...), accounts_to_delete: str = Form("")):
    # Получаем список аккаунтов на удаление
    acc_list = [x.strip() for x in accounts_to_delete.split(",") if x.strip()]
    
    async with get_db() as db:
        try:
            # 1. Сначала отвязываем ВСЕ аккаунты от этой группы
            await db.execute("UPDATE accounts SET work_group_id = NULL WHERE work_group_id = ?", (group_id,))
            
            # 2. Если пользователь выбрал аккаунты для полного удаления — удаляем их из БД
            for acc_name in acc_list:
                await db.execute("DELETE FROM accounts WHERE name = ?", (acc_name,))
                await db.execute("DELETE FROM messages WHERE account = ?", (acc_name,))
                await db.execute("DELETE FROM lead_profiles WHERE account = ?", (acc_name,))
            
            # 3. Удаляем саму группу
            await db.execute("DELETE FROM work_groups WHERE id = ?", (group_id,))
            await db.commit()
        except Exception as e:
            logger.error(f"Ошибка при удалении группы: {e}")
            return JSONResponse({"ok": False, "error": str(e)})

    # --- ПОЛНАЯ ЗАЧИСТКА ВЫБРАННЫХ АККАУНТОВ С СЕРВЕРА ---
    global accounts_cache
    for acc_name in acc_list:
        client = await _get_client(acc_name)
        if client is not None:
            try:
                if client.is_connected:
                    await client.stop()
            except Exception:
                logger.exception(f"Failed to stop client {acc_name}")
            async with clients_lock:
                if client in clients:
                    clients.remove(client)
        clients_dict.pop(acc_name, None)
        await task_manager.release_accounts([acc_name])
        
        # Чистим оперативную память
        accounts_cache[:] = [a for a in accounts_cache if a["name"] != acc_name]
        dialog_caches.pop(acc_name, None)
        dialog_locks.pop(acc_name, None)
        
        # Удаляем физические файлы сессий
        for ext in [".session", ".session-journal", ".json"]:
            fpath = SESSIONS_DIR / f"{acc_name}{ext}"
            if fpath.exists():
                try:
                    os.remove(fpath)
                except Exception:
                    logger.exception(f"Failed to delete {fpath}")

    return JSONResponse({"ok": True})