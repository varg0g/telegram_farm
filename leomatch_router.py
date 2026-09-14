import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiosqlite
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse

from logger import logger
from utils import check_rate_limit, get_current_user, manager
from farm_tools_router import running_tasks, task_stop_flags
from task_manager import task_manager
from database import get_db
from leomatch_engine import run_leomatch_autolike, run_leomatch_register, run_leomatch_warmup

leomatch_router = APIRouter()

LEOMATCH_PHOTOS_DIR = Path("uploads/leomatch")
LEOMATCH_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------------------
# 1. ЗАПУСК И УПРАВЛЕНИЕ ЗАДАЧАМИ
# ------------------------------------------------------------------------------

@leomatch_router.post("/api/leomatch/autolike/start", dependencies=[Depends(get_current_user)])
async def api_start_leomatch_autolike(request: Request):
    """
    Запуск умного автолайкера в Дайвинчике (@leomatchbot)
    """
    data = await request.json()
    account_names = data.get("account_names", [])
    group_id = data.get("group_id")

    if not account_names and group_id is not None:
        async with get_db() as db:
            cursor = await db.execute("SELECT name FROM accounts WHERE work_group_id = ?", (group_id,))
            rows = await cursor.fetchall()
            account_names = [r[0] for r in rows]

    if not account_names:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты для запуска")

    task_id = f"leo_{uuid.uuid4().hex[:6]}"
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts(account_names, task_id, "leomatch_autolike")
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
                "leomatch_autolike",
                "pending",
                len(account_names),
                f"Инициализация автолайкера Дайвинчик на {len(account_names)} аккаунтах...",
                ",".join(account_names),
                now_ts
            ))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts(account_names)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(run_leomatch_autolike(task_id, account_names, data))
    task_manager.register_task(task_id, task, "leomatch_autolike", account_names)

    return {"status": "ok", "task_id": task_id}


@leomatch_router.post("/api/leomatch/warmup/start", dependencies=[Depends(get_current_user)])
async def api_start_leomatch_warmup(request: Request):
    """
    Запуск умного прогрева анкет в Дайвинчике (@leomatchbot)
    с сохранением полной конфигурации и начального состояния
    """
    data = await request.json()
    account_names = data.get("account_names", [])
    group_id = data.get("group_id")

    if not account_names and group_id is not None:
        async with get_db() as db:
            cursor = await db.execute("SELECT name FROM accounts WHERE work_group_id = ?", (group_id,))
            rows = await cursor.fetchall()
            account_names = [r[0] for r in rows]

    if not account_names:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты для прогрева")

    task_id = f"warm_{uuid.uuid4().hex[:6]}"
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts(account_names, task_id, "leomatch_warmup")
    if not acquired:
        busy_desc = ", ".join([f"{acc} ({t})" for acc, t in busy.items()])
        raise HTTPException(status_code=409, detail=f"Следующие аккаунты заняты: {busy_desc}")

    stop_condition = data.get("stop_condition", "infinite")
    duration_minutes = float(data.get("duration_minutes", 0))
    stop_on_first_match = (stop_condition == "first_match") or bool(data.get("stop_on_first_match", False))

    config_str = json.dumps(data, ensure_ascii=False)
    initial_state_str = json.dumps({
        "start_ts": now_ts,
        "stop_condition": stop_condition,
        "duration_minutes": duration_minutes,
        "stop_on_first_match": stop_on_first_match,
        "elapsed_seconds": 0,
        "session_idx": 0,
        "total_likes": 0,
        "total_dislikes": 0,
        "total_matches": 0,
        "progress": 0,
        "progress_label": "[Инициализация]",
        "account_states": {a: {"likes": 0, "dislikes": 0, "matched": False, "completed": False} for a in account_names},
        "last_checkpoint_ts": now_ts
    }, ensure_ascii=False)

    try:
        async with get_db() as db:
            await db.execute("""
                INSERT INTO background_tasks 
                (id, task_type, status, progress, total, processed, log, account_names, created_at, config, state_json)
                VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?)
            """, (
                task_id,
                "leomatch_warmup",
                "pending",
                len(account_names),
                f"Инициализация прогрева анкет Дайвинчик на {len(account_names)} аккаунтах...",
                ",".join(account_names),
                now_ts,
                config_str,
                initial_state_str
            ))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts(account_names)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(run_leomatch_warmup(task_id, account_names, data))
    task_manager.register_task(task_id, task, "leomatch_warmup", account_names)

    return {"status": "ok", "task_id": task_id}


@leomatch_router.get("/api/leomatch/warmup/active", dependencies=[Depends(get_current_user)])
async def api_get_active_warmup():
    """
    Возвращает информацию о текущей активной задаче прогрева (если есть)
    для отображения живого прогресс-бара и статистики
    """
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT id, task_type, status, progress, total, processed, log, account_names, created_at, config, state_json
            FROM background_tasks
            WHERE task_type = 'leomatch_warmup' AND status IN ('running', 'pending')
            ORDER BY created_at DESC LIMIT 1
        """)
        row = await cursor.fetchone()
        if not row:
            return {"active": False, "task": None}

        task_id, t_type, status, progress, total, processed, log_msg, acc_str, created_at, config_raw, state_raw = row
        cfg = {}
        st = {}
        if config_raw:
            try:
                cfg = json.loads(config_raw)
            except Exception:
                pass
        if state_raw:
            try:
                st = json.loads(state_raw)
            except Exception:
                pass

        accounts = [a.strip() for a in acc_str.split(",") if a.strip()] if acc_str else []

        return {
            "active": True,
            "task": {
                "id": task_id,
                "task_type": t_type,
                "status": status,
                "progress": progress,
                "total": total,
                "processed": processed,
                "log": log_msg,
                "account_names": accounts,
                "created_at": created_at,
                "config": cfg,
                "state": st
            }
        }


@leomatch_router.post("/api/leomatch/register/start", dependencies=[Depends(get_current_user)])
async def api_start_leomatch_register(request: Request):
    """
    Запуск авторегистратора анкет в @leomatchbot
    """
    data = await request.json()
    account_names = data.get("account_names", [])
    group_id = data.get("group_id")

    if not account_names and group_id is not None:
        async with get_db() as db:
            cursor = await db.execute("SELECT name FROM accounts WHERE work_group_id = ?", (group_id,))
            rows = await cursor.fetchall()
            account_names = [r[0] for r in rows]

    if not account_names:
        raise HTTPException(status_code=400, detail="Не выбраны аккаунты для регистрации")

    task_id = f"reg_{uuid.uuid4().hex[:6]}"
    now_ts = int(time.time())

    acquired, busy = task_manager.try_acquire_accounts(account_names, task_id, "leomatch_register")
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
                "leomatch_register",
                "pending",
                len(account_names),
                f"Инициализация авторегистратора анкет Дайвинчик для {len(account_names)} аккаунтов...",
                ",".join(account_names),
                now_ts
            ))
            await db.commit()
    except Exception as e:
        task_manager.release_accounts(account_names)
        raise HTTPException(status_code=500, detail=f"Ошибка БД: {e}")

    task = asyncio.create_task(run_leomatch_register(task_id, account_names, data))
    task_manager.register_task(task_id, task, "leomatch_register", account_names)

    return {"status": "ok", "task_id": task_id}


@leomatch_router.post("/api/leomatch/stop/{task_id}", dependencies=[Depends(get_current_user)])
async def api_stop_leomatch_task(task_id: str):
    """
    Остановка запущенной задачи Дайвинчика
    """
    await task_manager.stop_task(task_id)

    async with get_db() as db:
        await db.execute("UPDATE background_tasks SET status = 'stopped', log = 'Остановлено пользователем' WHERE id = ?", (task_id,))
        await db.commit()

    await manager.broadcast({
        "type": "task_update",
        "task": {
            "id": task_id,
            "status": "stopped",
            "log": "Остановлено пользователем"
        }
    })

    return {"status": "ok", "stopped": task_id}


# ------------------------------------------------------------------------------
# 2. ХРАНИЛИЩЕ ВЗАИМОК (ЛИДЫ ДАЙВИНЧИКА)
# ------------------------------------------------------------------------------

@leomatch_router.get("/api/leomatch/matches", dependencies=[Depends(get_current_user)])
async def api_get_leomatch_matches(account: Optional[str] = None, group_id: Optional[int] = None, limit: int = 300):
    """
    Возвращает список пойманных взаимных симпатий со всех аккаунтов фермы
    (с поддержкой фильтрации по аккаунту и по рабочей группе)
    """
    async with get_db() as db:
        query = """
            SELECT m.id, m.account_name, m.lead_user_id, m.lead_username, m.lead_name, 
                   m.lead_info, m.message_text, m.created_at, a.work_group_id, g.title
            FROM leomatch_matches m
            LEFT JOIN accounts a ON a.name = m.account_name
            LEFT JOIN work_groups g ON g.id = a.work_group_id
        """
        params = []
        where_clauses = []
        if account:
            where_clauses.append("m.account_name = ?")
            params.append(account)
        if group_id is not None:
            where_clauses.append("a.work_group_id = ?")
            params.append(group_id)

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += " ORDER BY m.created_at DESC LIMIT ?"
        params.append(limit)

        cursor = await db.execute(query, tuple(params))
        rows = await cursor.fetchall()
        matches = []
        for r in rows:
            matches.append({
                "id": r[0],
                "account_name": r[1],
                "lead_user_id": r[2],
                "lead_username": r[3],
                "lead_name": r[4],
                "lead_info": r[5],
                "message_text": r[6],
                "created_at": r[7],
                "work_group_id": r[8],
                "group_title": r[9] or ""
            })

        return {"ok": True, "matches": matches, "count": len(matches)}


@leomatch_router.delete("/api/leomatch/matches/{match_id}", dependencies=[Depends(get_current_user)])
async def api_delete_match(match_id: int):
    """
    Удаляет отдельную взаимную симпатию из хранилища
    """
    async with get_db() as db:
        await db.execute("DELETE FROM leomatch_matches WHERE id = ?", (match_id,))
        await db.commit()
    return {"status": "ok", "deleted": match_id}


@leomatch_router.delete("/api/leomatch/matches", dependencies=[Depends(get_current_user)])
async def api_clear_all_matches():
    """
    Очищает всё хранилище взаимных симпатий
    """
    async with get_db() as db:
        await db.execute("DELETE FROM leomatch_matches")
        await db.commit()
    return {"status": "ok", "cleared": True}


# ------------------------------------------------------------------------------
# 3. ФОТОГРАФИИ ДЛЯ АНКЕТ ДАЙВИНЧИКА
# ------------------------------------------------------------------------------

@leomatch_router.post("/api/leomatch/photos", dependencies=[Depends(get_current_user)])
async def api_upload_leomatch_photos(files: List[UploadFile] = File(...)):
    """
    Загрузка фотографий для анкет Дайвинчика
    """
    LEOMATCH_PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    saved = 0
    for f in files:
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext in [".jpg", ".jpeg", ".png", ".webp"]:
            target_path = LEOMATCH_PHOTOS_DIR / f"{uuid.uuid4().hex[:12]}{ext}"
            with open(target_path, "wb") as out_f:
                shutil.copyfileobj(f.file, out_f)
            saved += 1

    total_photos = len([f for f in LEOMATCH_PHOTOS_DIR.iterdir() if f.is_file()])
    return {"status": "ok", "uploaded": saved, "total": total_photos}


@leomatch_router.get("/api/leomatch/photos-count", dependencies=[Depends(get_current_user)])
async def api_get_leomatch_photos_count():
    if not LEOMATCH_PHOTOS_DIR.exists():
        return {"count": 0}
    count = len([f for f in LEOMATCH_PHOTOS_DIR.iterdir() if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]])
    return {"count": count}


@leomatch_router.delete("/api/leomatch/photos", dependencies=[Depends(get_current_user)])
async def api_clear_leomatch_photos():
    if LEOMATCH_PHOTOS_DIR.exists():
        for f in LEOMATCH_PHOTOS_DIR.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass
    return {"status": "ok", "count": 0}
