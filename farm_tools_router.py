import asyncio
import json
import os
import random
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import List, Optional
import aiosqlite
from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse, PlainTextResponse
from pyrogram.raw import functions, types
from pyrogram.errors import (
    FloodWait, PeerFlood, UserPrivacyRestricted, UserDeactivated, RPCError,
    UsernameOccupied, UsernameInvalid, UsernameNotModified
)

from logger import logger
from utils import _get_client, accounts_cache, check_rate_limit, get_current_user, manager

farm_tools_router = APIRouter()

from task_manager import task_manager
from database import get_db, execute_query, execute_batch

# Хранилище задач через централизованный TaskManager (с обратной совместимостью)
running_tasks = task_manager.running_tasks
task_stop_flags = task_manager.task_stop_flags

def process_spintax(text: str) -> str:
    """Рекурсивный парсер спинтакса вида {вариант 1|вариант 2|{суб1|суб2}}"""
    pattern = re.compile(r'\{([^{}]+)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        choices = match.group(1).split('|')
        text = text[:match.start()] + random.choice(choices) + text[match.end():]
    return text

async def update_task(task_id: str, **kwargs):
    """Обновляет статус и прогресс задачи в БД и рассылает по WebSocket"""
    if not kwargs:
        return
    sets = []
    vals = []
    for k, v in kwargs.items():
        sets.append(f"{k} = ?")
        vals.append(v)
    vals.append(task_id)
    
    try:
        async with get_db() as db:
            await db.execute(f"UPDATE background_tasks SET {', '.join(sets)} WHERE id = ?", vals)
            await db.commit()
            
            cursor = await db.execute("SELECT id, task_type, status, progress, total, processed, log, created_at FROM background_tasks WHERE id = ?", (task_id,))
            row = await cursor.fetchone()
            if row:
                task_data = {
                    "id": row[0],
                    "task_type": row[1],
                    "status": row[2],
                    "progress": row[3],
                    "total": row[4],
                    "processed": row[5],
                    "log": row[6],
                    "created_at": row[7]
                }
                await manager.broadcast({
                    "type": "task_update",
                    "task": task_data
                })
    except Exception as e:
        logger.error(f"Error updating task {task_id}: {e}")

# ==================== ФОНОВАЯ ЛОГИКА ПАРСЕРА ====================

async def run_parser(task_id: str, account_name: str, target_chat: str, filter_username: bool, filter_no_bots: bool, parse_mode: str, max_count: int):
    async with task_manager.task_scope(task_id, [account_name], "parser"):
        client = await _get_client(account_name)
        if not client:
            await update_task(task_id, status="failed", log=f"Аккаунт {account_name} не подключен")
            return

        clean_target = target_chat.strip()
        if clean_target.startswith("https://t.me/"):
            clean_target = clean_target.replace("https://t.me/", "")
        elif clean_target.startswith("t.me/"):
            clean_target = clean_target.replace("t.me/", "")
        if clean_target.startswith("+"):
            pass
        elif not clean_target.startswith("@") and not clean_target.lstrip("-").isdigit():
            clean_target = "@" + clean_target

        await update_task(task_id, status="running", log=f"Подключение к {clean_target}...")

        batch = []
        added_to_db = 0

        async def flush_batch():
            nonlocal batch, added_to_db
            if not batch:
                return
            try:
                async with get_db() as db:
                    cursor = await db.executemany("""
                        INSERT OR IGNORE INTO scraped_leads 
                        (username, user_id, first_name, last_name, phone, source_chat, created_at, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'new')
                    """, batch)
                    if cursor.rowcount > 0:
                        added_to_db += cursor.rowcount
                    await db.commit()
            except Exception as ex:
                logger.error(f"Error saving scraped leads batch: {ex}")
            finally:
                batch = []

        try:
            # Пытаемся получить чат
            try:
                chat = await client.get_chat(clean_target)
            except Exception:
                # Если чат еще не в кэше/диалогах, пробуем вступить
                try:
                    chat = await client.join_chat(clean_target)
                except Exception as e:
                    await update_task(task_id, status="failed", log=f"Не удалось открыть чат: {e}")
                    return

            collected = 0
            now_ts = int(time.time())

            if parse_mode == "members":
                # Режим 1: Парсинг списка участников
                await update_task(task_id, log=f"Сбор участников из '{chat.title}'...")
                try:
                    async for member in client.get_chat_members(chat.id):
                        if task_manager.is_stopped(task_id):
                            await flush_batch()
                            await update_task(task_id, status="stopped", log="Остановлено пользователем")
                            return

                        u = member.user
                        if not u:
                            continue
                        if filter_no_bots and u.is_bot:
                            continue
                        if filter_username and not u.username:
                            continue

                        batch.append((
                            f"@{u.username}" if u.username else "",
                            u.id,
                            u.first_name or "",
                            u.last_name or "",
                            u.phone_number or "",
                            chat.title or str(clean_target),
                            now_ts
                        ))

                        if len(batch) >= 25:
                            await flush_batch()

                        collected += 1
                        if max_count and collected >= max_count:
                            break

                        if collected % 15 == 0:
                            pct = min(99, int((collected / (max_count or 500)) * 100))
                            await update_task(task_id, progress=pct, processed=added_to_db, log=f"Собрано: {added_to_db} новых лидов")

                    await flush_batch()
                except RPCError as e:
                    await flush_batch()
                    await update_task(task_id, log=f"Список участников скрыт ({e}). Переключаюсь на парсинг авторов сообщений...")
                    parse_mode = "messages"

            if parse_mode == "messages":
                # Режим 2: Парсинг авторов сообщений из истории
                await update_task(task_id, log=f"Сбор активных авторов из сообщений '{chat.title}'...")
                seen_users = set()
                
                async for msg in client.get_chat_history(chat.id, limit=max_count or 1000):
                    if task_manager.is_stopped(task_id):
                        await flush_batch()
                        await update_task(task_id, status="stopped", log="Остановлено пользователем")
                        return

                    u = msg.from_user
                    if not u or u.id in seen_users:
                        continue
                    seen_users.add(u.id)

                    if filter_no_bots and u.is_bot:
                        continue
                    if filter_username and not u.username:
                        continue

                    batch.append((
                        f"@{u.username}" if u.username else "",
                        u.id,
                        u.first_name or "",
                        u.last_name or "",
                        u.phone_number or "",
                        chat.title or str(clean_target),
                        now_ts
                    ))

                    if len(batch) >= 25:
                        await flush_batch()

                    collected += 1
                    if max_count and collected >= max_count:
                        break

                    if collected % 10 == 0:
                        pct = min(99, int((collected / (max_count or 300)) * 100))
                        await update_task(task_id, progress=pct, processed=added_to_db, log=f"Собрано: {added_to_db} авторов сообщений")

                await flush_batch()

            await update_task(task_id, status="completed", progress=100, processed=added_to_db, total=collected, log=f"Завершено! Добавлено {added_to_db} лидов в базу.")

        except Exception as e:
            logger.exception(f"Parser error in task {task_id}")
            await update_task(task_id, status="failed", log=f"Ошибка: {str(e)[:150]}")

# ==================== ФОНОВАЯ ЛОГИКА РАССЫЛКИ ====================

async def run_broadcast(task_id: str, account_names: List[str], targets: List[str], template_text: str, min_delay: int, max_delay: int, max_per_account: int):
    async with task_manager.task_scope(task_id, account_names, "broadcast"):
        # Получаем активных клиентов
        active_clients = []
        for acc in account_names:
            c = await _get_client(acc)
            if c and c.is_connected:
                active_clients.append(c)

        if not active_clients:
            await update_task(task_id, status="failed", log="Ни один из выбранных аккаунтов не подключен")
            return

        total_targets = len(targets)
        processed = 0
        success_count = 0
        fail_count = 0
        
        # Счетчики на аккаунт
        sent_by_account = {c.name: 0 for c in active_clients}
        acc_idx = 0

        await update_task(task_id, status="running", total=total_targets, processed=0, progress=0, log=f"Старт рассылки по {total_targets} получателям с {len(active_clients)} акк.")

        try:
            for target in targets:
                if task_manager.is_stopped(task_id):
                    await update_task(task_id, status="stopped", log=f"Остановлено пользователем. Отправлено: {success_count}")
                    return

                # Находим аккаунт, не превысивший лимит
                available_clients = [c for c in active_clients if sent_by_account[c.name] < max_per_account]
                if not available_clients:
                    await update_task(task_id, status="completed", log=f"Все аккаунты достигли лимита ({max_per_account} сообщ.)")
                    break

                client = available_clients[acc_idx % len(available_clients)]
                acc_idx += 1

                # Генерация уникального текста через Spintax
                text_to_send = process_spintax(template_text)

                clean_target = target.strip()
                if not clean_target:
                    continue

                try:
                    # Если передан числовой ID
                    dest = int(clean_target) if clean_target.lstrip("-").isdigit() else clean_target
                    await client.send_message(dest, text_to_send)
                    success_count += 1
                    sent_by_account[client.name] += 1
                    
                    # Обновляем статус лида в базе
                    async with get_db() as db:
                        await db.execute("UPDATE scraped_leads SET status = 'messaged' WHERE username = ? OR user_id = ?", (clean_target, clean_target))
                        await db.commit()

                except FloodWait as e:
                    logger.warning(f"FloodWait on {client.name}: sleep {e.value}s")
                    # Временно исключаем этот аккаунт или ждем если он единственный
                    if len(available_clients) == 1:
                        await update_task(task_id, log=f"FloodWait {e.value}с на {client.name}, ожидание...")
                        await asyncio.sleep(e.value + 1)
                    else:
                        sent_by_account[client.name] = max_per_account  # временно снимаем с рейса
                except (PeerFlood, UserPrivacyRestricted, UserDeactivated) as e:
                    fail_count += 1
                    logger.warning(f"Restriction on {client.name} for target {clean_target}: {e}")
                    async with get_db() as db:
                        await db.execute("UPDATE scraped_leads SET status = 'restricted' WHERE username = ? OR user_id = ?", (clean_target, clean_target))
                        await db.commit()
                except Exception as e:
                    fail_count += 1
                    logger.error(f"Error sending from {client.name} to {clean_target}: {e}")

                processed += 1
                progress = int((processed / total_targets) * 100)
                await update_task(
                    task_id, 
                    progress=progress, 
                    processed=processed, 
                    log=f"Отправлено: {success_count} | Ошибок: {fail_count} (аккаунт {client.name})"
                )

                # Безопасная пауза между отправками (human delay)
                delay = random.uniform(min_delay, max_delay)
                await asyncio.sleep(delay)

            await update_task(task_id, status="completed", progress=100, processed=processed, log=f"Рассылка завершена! Успешно: {success_count}, ошибок: {fail_count}")

        except Exception as e:
            logger.exception(f"Broadcast error in task {task_id}")
            await update_task(task_id, status="failed", log=f"Ошибка: {str(e)[:150]}")

# ==================== HTTP ENDPOINTS ====================

@farm_tools_router.post("/api/tools/spintax_preview", dependencies=[Depends(get_current_user)])
async def api_spintax_preview(request: Request, text: str = Form(...)):
    """Генерирует 3 примера текста со спинтаксом для проверки пользователем"""
    await check_rate_limit(request, max_req=60, scope="write")
    samples = [process_spintax(text) for _ in range(3)]
    return {"samples": samples}

@farm_tools_router.post("/api/tools/parse", dependencies=[Depends(get_current_user)])
async def api_start_parse(
    request: Request,
    account_name: str = Form(...),
    target_chat: str = Form(...),
    filter_username: bool = Form(False),
    filter_no_bots: bool = Form(True),
    parse_mode: str = Form("members"),  # 'members' или 'messages'
    max_count: int = Form(500)
):
    await check_rate_limit(request, max_req=30, scope="write")

    task_id = "parse_" + uuid.uuid4().hex[:8]
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts([account_name], task_id, "parser")
    if not acquired:
        busy_desc = ", ".join([f"{acc} ({t})" for acc, t in busy.items()])
        raise HTTPException(status_code=409, detail=f"Аккаунт уже занят другой задачей: {busy_desc}")

    try:
        async with get_db() as db:
            await db.execute("""
                INSERT INTO background_tasks 
                (id, task_type, status, progress, total, processed, log, account_names, created_at)
                VALUES (?, 'parser', 'pending', 0, ?, 0, 'Инициализация парсера...', ?, ?)
            """, (task_id, max_count, account_name, now_ts))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts([account_name])
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(
        run_parser(task_id, account_name, target_chat, filter_username, filter_no_bots, parse_mode, max_count)
    )
    task_manager.register_task(task_id, task, "parser", [account_name])

    return {"status": "ok", "task_id": task_id}

@farm_tools_router.post("/api/tools/broadcast", dependencies=[Depends(get_current_user)])
async def api_start_broadcast(
    request: Request,
    account_names: str = Form(...),       # comma-separated
    target_source: str = Form("leads"),    # 'leads' или 'custom'
    custom_targets: str = Form(""),       # newline-separated usernames/IDs
    template_text: str = Form(...),
    min_delay: int = Form(15),
    max_delay: int = Form(35),
    max_per_account: int = Form(25),
    limit_total: int = Form(200)
):
    await check_rate_limit(request, max_req=20, scope="write")

    accounts = [a.strip() for a in account_names.split(",") if a.strip()]
    if not accounts:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один аккаунт")

    # Формируем список получателей
    targets: List[str] = []
    if target_source == "leads":
        async with get_db() as db:
            cursor = await db.execute("""
                SELECT COALESCE(NULLIF(username, ''), user_id) 
                FROM scraped_leads 
                WHERE status = 'new' 
                ORDER BY id DESC 
                LIMIT ?
            """, (limit_total,))
            rows = await cursor.fetchall()
            targets = [str(r[0]) for r in rows if r[0]]
    else:
        for line in custom_targets.splitlines():
            cleaned = line.strip()
            if cleaned:
                targets.append(cleaned)

    if not targets:
        raise HTTPException(status_code=400, detail="Список получателей пуст")

    task_id = "broadcast_" + uuid.uuid4().hex[:8]
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts(accounts, task_id, "broadcast")
    if not acquired:
        busy_desc = ", ".join([f"{acc} ({t})" for acc, t in busy.items()])
        raise HTTPException(status_code=409, detail=f"Следующие аккаунты заняты: {busy_desc}")

    try:
        async with get_db() as db:
            await db.execute("""
                INSERT INTO background_tasks 
                (id, task_type, status, progress, total, processed, log, account_names, created_at)
                VALUES (?, 'broadcast', 'pending', 0, ?, 0, 'Инициализация рассылки...', ?, ?)
            """, (task_id, len(targets), ",".join(accounts), now_ts))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts(accounts)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(
        run_broadcast(task_id, accounts, targets, template_text, min_delay, max_delay, max_per_account)
    )
    task_manager.register_task(task_id, task, "broadcast", accounts)

    return {"status": "ok", "task_id": task_id, "targets_count": len(targets)}

@farm_tools_router.get("/api/tools/leads", dependencies=[Depends(get_current_user)])
async def api_get_leads(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    q: Optional[str] = None
):
    offset = (page - 1) * limit
    params = []
    where_clauses = []

    if status:
        where_clauses.append("status = ?")
        params.append(status)
    if q:
        where_clauses.append("(username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR source_chat LIKE ?)")
        search_str = f"%{q}%"
        params.extend([search_str, search_str, search_str, search_str])

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    async with get_db() as db:
        c_count = await db.execute(f"SELECT COUNT(*) FROM scraped_leads {where_sql}", params)
        total = (await c_count.fetchone())[0]

        c_items = await db.execute(f"""
            SELECT id, username, user_id, first_name, last_name, phone, source_chat, created_at, status 
            FROM scraped_leads 
            {where_sql} 
            ORDER BY id DESC 
            LIMIT ? OFFSET ?
        """, params + [limit, offset])
        rows = await c_items.fetchall()

    items = [
        {
            "id": r[0],
            "username": r[1],
            "user_id": r[2],
            "first_name": r[3],
            "last_name": r[4],
            "phone": r[5],
            "source_chat": r[6],
            "created_at": r[7],
            "status": r[8]
        }
        for r in rows
    ]

    return {"items": items, "total": total, "page": page, "limit": limit}

@farm_tools_router.get("/api/tools/leads/export", dependencies=[Depends(get_current_user)])
async def api_export_leads(format: str = Query("txt")):
    """Выгрузка базы лидов в .txt (юзернеймы) или .csv"""
    async with get_db() as db:
        cursor = await db.execute("SELECT username, user_id, first_name, last_name, phone, source_chat, status FROM scraped_leads ORDER BY id DESC")
        rows = await cursor.fetchall()

    if format == "csv":
        output = "username,user_id,first_name,last_name,phone,source_chat,status\n"
        for r in rows:
            u_name = r[0] or ""
            f_name = (r[2] or "").replace(",", " ")
            l_name = (r[3] or "").replace(",", " ")
            source = (r[5] or "").replace(",", " ")
            output += f"{u_name},{r[1] or ''},{f_name},{l_name},{r[4] or ''},{source},{r[6]}\n"
        return Response(
            content=output,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=scraped_leads.csv"}
        )
    else:
        # Текстовый список юзернеймов
        lines = []
        for r in rows:
            if r[0]:
                lines.append(r[0])
            elif r[1]:
                lines.append(str(r[1]))
        return PlainTextResponse(
            content="\n".join(lines),
            headers={"Content-Disposition": "attachment; filename=leads_usernames.txt"}
        )

@farm_tools_router.post("/api/tools/leads/clear", dependencies=[Depends(get_current_user)])
async def api_clear_leads():
    async with get_db() as db:
        await db.execute("DELETE FROM scraped_leads")
        await db.commit()
    return {"status": "ok"}

@farm_tools_router.get("/api/tools/tasks", dependencies=[Depends(get_current_user)])
async def api_get_tasks():
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT id, task_type, status, progress, total, processed, log, account_names, created_at 
            FROM background_tasks 
            ORDER BY created_at DESC 
            LIMIT 20
        """)
        rows = await cursor.fetchall()

    tasks = [
        {
            "id": r[0],
            "task_type": r[1],
            "status": r[2],
            "progress": r[3],
            "total": r[4],
            "processed": r[5],
            "log": r[6],
            "account_names": r[7],
            "created_at": r[8]
        }
        for r in rows
    ]
    return {"tasks": tasks}

@farm_tools_router.post("/api/tools/tasks/stop", dependencies=[Depends(get_current_user)])
async def api_stop_task(task_id: str = Form(...)):
    await task_manager.stop_task(task_id)
    await update_task(task_id, status="stopped", log="Остановлено пользователем")
    return {"status": "ok"}


# ==============================================================================
# АВТОЗАПОЛНЕНИЕ ПРОФИЛЕЙ И НАСТРОЙКИ КОНФИДЕНЦИАЛЬНОСТИ
# ==============================================================================

TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
}

def transliterate(text: str) -> str:
    """Транслитерация русского текста в латиницу"""
    return ''.join(TRANSLIT.get(c, c) for c in (text or '').lower())

def load_data_lines(file_path: str) -> list[str]:
    """Загрузка строк из текстового файла"""
    p = Path(file_path)
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip()]
        except Exception:
            pass
    return []

async def set_unique_username(client, first_name: str, last_name: str) -> Optional[str]:
    """Генерация и установка уникального человекоподобного @username с MTProto-проверкой"""
    base_name = transliterate(first_name) or "user"
    base_surname = transliterate(last_name) or "farm"
    base_name = ''.join(c for c in base_name if c.isalnum() or c == '_')
    base_surname = ''.join(c for c in base_surname if c.isalnum() or c == '_')
    if not base_name:
        base_name = "user"
    if not base_surname:
        base_surname = "farm"

    year = random.randint(1996, 2006)
    short_year = year % 100
    candidates = [
        f"{base_name}_{base_surname}",
        f"{base_surname}_{base_name}",
        f"{base_name}{base_surname}",
        f"{base_name}_{base_surname}{year}",
        f"{base_surname}{base_name}{short_year}",
        f"{base_name}_{base_surname}_{random.randint(10, 99)}",
        f"{base_name}{year}_{base_surname[:3]}",
        f"{base_name}_{base_surname}{random.randint(100, 999)}",
        f"{base_name}{random.randint(1, 9)}_{base_surname}",
        f"{base_surname[:4]}_{base_name}{random.randint(0, 99)}",
        f"{base_name}_{random.randint(10, 99)}_{base_surname[:4]}",
        f"{base_name}{base_surname[:3]}{random.randint(10, 999)}",
        f"real_{base_name}_{base_surname[:3]}",
        f"{base_name}_{base_surname[:5]}_{random.randint(1, 99)}",
    ]
    random.shuffle(candidates)

    for cand in candidates[:15]:
        cand = cand.replace('.', '_')
        if len(cand) < 5:
            cand = f"{cand}{random.randint(100, 999)}"
        cand = cand[:32]
        try:
            available = await client.invoke(functions.account.CheckUsername(username=cand))
            if not available:
                continue
            await client.set_username(cand)
            return cand
        except UsernameOccupied:
            continue
        except (UsernameInvalid, UsernameNotModified):
            continue
        except FloodWait as e:
            if e.value <= 10:
                await asyncio.sleep(e.value + 1)
                continue
            break
        except Exception:
            continue

    # Резервная попытка с повышенной уникальностью
    try:
        fallback = f"{base_name[:6]}_{base_surname[:4]}_{random.randint(1000, 9999)}"
        if len(fallback) < 5:
            fallback = f"user_{random.randint(10000, 99999)}"
        fallback = fallback[:32]
        await client.set_username(fallback)
        return fallback
    except Exception:
        return None

async def apply_privacy_settings(client, privacy_config: dict) -> list[str]:
    """Применение настроек конфиденциальности через MTProto"""
    applied = []

    def get_rule(val: str):
        if val == "nobody":
            return [types.InputPrivacyValueDisallowAll()]
        elif val == "contacts":
            return [types.InputPrivacyValueAllowContacts()]
        elif val == "everybody":
            return [types.InputPrivacyValueAllowAll()]
        return None

    # 1. Номер телефона
    p_num = privacy_config.get("phone_number", "nobody")
    rule = get_rule(p_num)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyPhoneNumber(),
                rules=rule
            ))
            applied.append(f"Номер: {p_num}")
        except Exception as e:
            logger.warning(f"Error setting phone_number privacy: {e}")

    # 2. Поиск по номеру (AddedByPhone)
    p_added = privacy_config.get("added_by_phone", "nobody")
    if p_added == "nobody":
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyAddedByPhone(),
                rules=[types.InputPrivacyValueDisallowAll()]
            ))
            applied.append("Поиск по номеру: никто")
        except RPCError:
            try:
                await client.invoke(functions.account.SetPrivacy(
                    key=types.InputPrivacyKeyAddedByPhone(),
                    rules=[types.InputPrivacyValueAllowContacts()]
                ))
                applied.append("Поиск по номеру: контакты (фоллбэк)")
            except Exception as e:
                logger.warning(f"Error setting added_by_phone fallback: {e}")
    else:
        rule = get_rule(p_added)
        if rule:
            try:
                await client.invoke(functions.account.SetPrivacy(
                    key=types.InputPrivacyKeyAddedByPhone(),
                    rules=rule
                ))
                applied.append(f"Поиск по номеру: {p_added}")
            except Exception as e:
                logger.warning(f"Error setting added_by_phone: {e}")

    # 3. Время захода (Last Seen)
    p_seen = privacy_config.get("status_timestamp", "everybody")
    rule = get_rule(p_seen)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyStatusTimestamp(),
                rules=rule
            ))
            applied.append(f"В сети: {p_seen}")
        except Exception as e:
            logger.warning(f"Error setting status_timestamp: {e}")

    # 4. Фото профиля
    p_photo = privacy_config.get("profile_photo", "everybody")
    rule = get_rule(p_photo)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyProfilePhoto(),
                rules=rule
            ))
            applied.append(f"Фото: {p_photo}")
        except Exception as e:
            logger.warning(f"Error setting profile_photo: {e}")

    # 5. Пересылка сообщений (Forwards)
    p_fwd = privacy_config.get("forwards", "nobody")
    rule = get_rule(p_fwd)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyForwards(),
                rules=rule
            ))
            applied.append(f"Пересылка: {p_fwd}")
        except Exception as e:
            logger.warning(f"Error setting forwards privacy: {e}")

    # 6. Звонки
    p_call = privacy_config.get("phone_call", "nobody")
    rule = get_rule(p_call)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyPhoneCall(),
                rules=rule
            ))
            applied.append(f"Звонки: {p_call}")
        except Exception as e:
            logger.warning(f"Error setting phone_call privacy: {e}")

    # 7. P2P при звонках (скрытие IP)
    p_p2p = privacy_config.get("phone_p2p", "nobody")
    rule = get_rule(p_p2p)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyPhoneP2P(),
                rules=rule
            ))
            applied.append(f"P2P: {p_p2p}")
        except Exception as e:
            logger.warning(f"Error setting phone_p2p privacy: {e}")

    # 8. Добавление в группы и каналы
    p_inv = privacy_config.get("chat_invite", "contacts")
    rule = get_rule(p_inv)
    if rule:
        try:
            await client.invoke(functions.account.SetPrivacy(
                key=types.InputPrivacyKeyChatInvite(),
                rules=rule
            ))
            applied.append(f"Группы: {p_inv}")
        except Exception as e:
            logger.warning(f"Error setting chat_invite privacy: {e}")

    return applied

async def run_profile_auto_filler(
    task_id: str,
    account_names: List[str],
    options: dict
):
    """Фоновый исполнитель задачи автозаполнения профилей и настройки приватности"""
    async with task_manager.task_scope(task_id, account_names, "profile_filler"):
        await update_task(task_id, status="running", log="Запуск автозаполнения профилей...")

        change_name = options.get("change_name", False)
        change_bio = options.get("change_bio", False)
        set_user = options.get("set_username", False)
        set_photo = options.get("set_avatar", False)
        enable_2fa = options.get("enable_2fa", False)
        two_fa_password = str(options.get("two_fa_password") or "").strip()
        two_fa_hint = str(options.get("two_fa_hint") or "farm").strip()
        apply_priv = options.get("apply_privacy", False)
        privacy_cfg = options.get("privacy_config", {})
        delay_min = max(2, int(options.get("delay_min", 5)))
        delay_max = max(delay_min, int(options.get("delay_max", 12)))

        # Загружаем пулы данных
        custom_names = options.get("names_custom")
        names_pool = custom_names if custom_names else load_data_lines("data/names.txt")
        if not names_pool:
            names_pool = ["Александр", "Дмитрий", "Иван", "Максим", "Анна", "Елена"]

        custom_surnames = options.get("surnames_custom")
        surnames_pool = custom_surnames if custom_surnames else load_data_lines("data/surnames.txt")
        if not surnames_pool:
            surnames_pool = ["Иванов", "Смирнов", "Кузнецов", "Попов"]

        custom_bios = options.get("bios_custom")
        bio_pool = custom_bios if custom_bios else load_data_lines("data/bio.txt")
        if not bio_pool:
            bio_pool = ["{Привет!|Здравствуйте!} {На связи|В сети}"]

        avatars_dir = Path("uploads/avatars")
        avatar_files = []
        if set_photo and avatars_dir.exists():
            avatar_files = [
                f for f in avatars_dir.iterdir()
                if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
            ]

        total = len(account_names)
        processed = 0

        for idx, acc_name in enumerate(account_names):
            if task_manager.is_stopped(task_id):
                await update_task(task_id, status="stopped", log="Остановлено пользователем")
                return

            client = await _get_client(acc_name)
            if not client:
                await update_task(task_id, log=f"[{acc_name}] ⚠️ Клиент не подключен, пропускаем")
                continue

            acc_log = []
            fn = random.choice(names_pool)
            ln = random.choice(surnames_pool) if surnames_pool and random.choice([True, False]) else ""

            # 1. Имя, фамилия, био
            try:
                if change_name or change_bio:
                    update_kwargs = {}
                    if change_name:
                        update_kwargs["first_name"] = fn
                        if ln:
                            update_kwargs["last_name"] = ln
                    if change_bio:
                        raw_bio = random.choice(bio_pool)
                        update_kwargs["bio"] = process_spintax(raw_bio)

                    await client.update_profile(**update_kwargs)
                    acc_log.append(f"Имя: {fn} {ln}".strip())
                    if "bio" in update_kwargs:
                        acc_log.append("Био обновлено")
            except Exception as e:
                acc_log.append(f"Ошибка имени/био: {e}")

            # 2. Юзернейм
            if set_user:
                try:
                    new_uname = await set_unique_username(client, fn, ln)
                    if new_uname:
                        acc_log.append(f"@{new_uname}")
                    else:
                        acc_log.append("Юзернейм: не подобран")
                except Exception as e:
                    acc_log.append(f"Ошибка юзернейма: {e}")

            # 3. Аватарка
            if set_photo and avatar_files:
                try:
                    chosen_avatar = random.choice(avatar_files)
                    await client.set_profile_photo(photo=str(chosen_avatar))
                    acc_log.append("Аватар установлен")
                except Exception as e:
                    acc_log.append(f"Ошибка фото: {e}")

            # 4. 2FA Пароль
            if enable_2fa and two_fa_password:
                try:
                    await client.enable_cloud_password(password=two_fa_password, hint=two_fa_hint)
                    acc_log.append("2FA включен")
                except RPCError:
                    acc_log.append("2FA (уже установлен или сбой)")
                except Exception as e:
                    acc_log.append(f"Ошибка 2FA: {e}")

            # 5. Конфиденциальность
            if apply_priv and privacy_cfg:
                try:
                    priv_res = await apply_privacy_settings(client, privacy_cfg)
                    acc_log.append(f"Приватность: {len(priv_res)} правил")
                except Exception as e:
                    acc_log.append(f"Ошибка приватности: {e}")

            processed += 1
            pct = int((processed / total) * 100)
            log_line = f"[{processed}/{total}] {acc_name}: " + (", ".join(acc_log) if acc_log else "Без изменений")
            await update_task(task_id, progress=pct, processed=processed, log=log_line)

            if idx < total - 1:
                delay = random.randint(delay_min, delay_max)
                for _ in range(delay):
                    if task_manager.is_stopped(task_id):
                        await update_task(task_id, status="stopped", log="Остановлено пользователем")
                        return
                    await asyncio.sleep(1)

        await update_task(task_id, status="completed", progress=100, log=f"✅ Завершено. Настроено {processed} из {total} аккаунтов")


# --- ЭНДПОИНТЫ АВТОЗАПОЛНЕНИЯ И ПРИВАТНОСТИ ---

@farm_tools_router.post("/api/tools/profile/start", dependencies=[Depends(get_current_user)])
async def api_start_profile_filler(request: Request):
    data = await request.json()
    account_names = data.get("account_names", [])
    if not account_names:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты")

    task_id = str(uuid.uuid4())[:8]
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts(account_names, task_id, "profile_filler")
    if not acquired:
        busy_desc = ", ".join([f"{acc} ({t})" for acc, t in busy.items()])
        raise HTTPException(status_code=409, detail=f"Следующие аккаунты заняты: {busy_desc}")

    try:
        async with get_db() as db:
            await db.execute("""
                INSERT INTO background_tasks 
                (id, task_type, status, progress, total, processed, log, account_names, created_at)
                VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?)
            """, (
                task_id,
                "profile_filler",
                "pending",
                len(account_names),
                f"Инициализация настройки {len(account_names)} аккаунтов...",
                ",".join(account_names),
                now_ts
            ))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts(account_names)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(run_profile_auto_filler(task_id, account_names, data))
    task_manager.register_task(task_id, task, "profile_filler", account_names)

    return {"status": "ok", "task_id": task_id}

@farm_tools_router.post("/api/tools/profile/avatars", dependencies=[Depends(get_current_user)])
async def api_upload_avatars(files: List[UploadFile] = File(...)):
    avatars_dir = Path("uploads/avatars")
    avatars_dir.mkdir(parents=True, exist_ok=True)

    saved = 0
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext in [".jpg", ".jpeg", ".png", ".webp"]:
            target_path = avatars_dir / f"{uuid.uuid4().hex[:12]}{ext}"
            with open(target_path, "wb") as out_file:
                shutil.copyfileobj(f.file, out_file)
            saved += 1

    total_avatars = len([f for f in avatars_dir.iterdir() if f.is_file()])
    return {"status": "ok", "uploaded": saved, "total": total_avatars}

@farm_tools_router.get("/api/tools/profile/avatars-count", dependencies=[Depends(get_current_user)])
async def api_get_avatars_count():
    avatars_dir = Path("uploads/avatars")
    if not avatars_dir.exists():
        return {"count": 0}
    count = len([f for f in avatars_dir.iterdir() if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]])
    return {"count": count}

@farm_tools_router.delete("/api/tools/profile/avatars", dependencies=[Depends(get_current_user)])
async def api_clear_avatars():
    avatars_dir = Path("uploads/avatars")
    if avatars_dir.exists():
        for f in avatars_dir.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass
    return {"status": "ok", "count": 0}

