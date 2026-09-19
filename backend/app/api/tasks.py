from fastapi import APIRouter, Depends, HTTPException
from typing import List, Dict, Any
from app.core.security import get_current_admin
from app.services.task_engine import task_engine
from app.db.database import db

router = APIRouter(prefix="/api/tasks", tags=["tasks"], dependencies=[Depends(get_current_admin)])

@router.get("")
async def api_list_tasks():
    """Возвращает все последние фоновые задачи."""
    return await db.fetch_all("SELECT * FROM background_tasks ORDER BY updated_at DESC LIMIT 50")

@router.get("/active")
async def api_list_active_tasks():
    """Возвращает только активные фоновые задачи (для статус-бара в UI)."""
    return await task_engine.get_active_tasks()

@router.post("/{task_id}/pause")
async def api_pause_task(task_id: str):
    await task_engine.pause_task(task_id)
    return {"status": "ok"}

@router.post("/{task_id}/resume")
async def api_resume_task(task_id: str):
    await task_engine.resume_task(task_id)
    return {"status": "ok"}

@router.get("/{task_id}")
async def api_get_task(task_id: str):
    """Возвращает информацию о задаче и полный лог."""
    task = await db.fetch_one("SELECT * FROM background_tasks WHERE id = ?", (task_id,))
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return dict(task)

@router.post("/{task_id}/cancel")
async def api_cancel_task(task_id: str):
    await task_engine.cancel_task(task_id)
    return {"status": "ok"}
