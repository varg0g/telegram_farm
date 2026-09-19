import asyncio
import time
import json
from typing import Dict, Any, Optional, List
from app.db.database import db
from app.core.logger import logger
from app.telegram.events_dispatcher import broadcaster

class TaskEngine:
    """
    Централизованный диспетчер фоновых задач CRM:
    - Отслеживание прогресса в реальном времени (прогресс-бар в нижнем правом углу).
    - Поддержка паузы, возобновления и мягкой отмены.
    - Сохранение состояния в БД для восстановления при перезапусках.
    """
    _instance = None

    def __init__(self):
        self.stop_flags: Dict[str, bool] = {}       # task_id -> bool
        self.pause_events: Dict[str, asyncio.Event] = {} # task_id -> asyncio.Event
        self.running_coros: Dict[str, asyncio.Task] = {} # task_id -> asyncio.Task

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = TaskEngine()
        return cls._instance

    async def register_task(
        self,
        task_id: str,
        task_type: str,
        title: str,
        total: int,
        account_phones: List[str],
        config: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Регистрирует новую фоновую задачу в памяти и БД."""
        now = int(time.time())
        self.stop_flags[task_id] = False
        pause_ev = asyncio.Event()
        pause_ev.set()  # по умолчанию не на паузе
        self.pause_events[task_id] = pause_ev

        task_data = {
            "id": task_id,
            "task_type": task_type,
            "title": title,
            "status": "running",
            "progress": 0,
            "total": total,
            "processed": 0,
            "log": f"[{time.strftime('%H:%M:%S')}] Задача инициализирована\n",
            "account_phones": json.dumps(account_phones),
            "config_json": json.dumps(config) if config else None,
            "created_at": now,
            "updated_at": now
        }

        sql = """
            INSERT INTO background_tasks 
            (id, task_type, title, status, progress, total, processed, log, account_phones, config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        await db.execute(sql, (
            task_id, task_type, title, "running", 0, total, 0,
            task_data["log"], task_data["account_phones"], task_data["config_json"], now, now
        ))

        await broadcaster.broadcast({
            "type": "task_update",
            "task": task_data
        })
        return task_data

    async def update_progress(
        self,
        task_id: str,
        processed: Optional[int] = None,
        total: Optional[int] = None,
        log_line: Optional[str] = None,
        status: Optional[str] = None
    ):
        """Обновляет прогресс задачи и моментально транслирует в статус-бар UI."""
        sets = []
        vals = []

        if processed is not None:
            sets.append("processed = ?")
            vals.append(processed)
        if total is not None:
            sets.append("total = ?")
            vals.append(total)
            if total > 0 and processed is not None:
                pct = min(100, int((processed / total) * 100))
                sets.append("progress = ?")
                vals.append(pct)
        if status:
            sets.append("status = ?")
            vals.append(status)
        if log_line:
            timestamp = time.strftime("%H:%M:%S")
            formatted = f"[{timestamp}] {log_line}\n"
            sets.append("log = log || ?")
            vals.append(formatted)

        now = int(time.time())
        sets.append("updated_at = ?")
        vals.append(now)
        vals.append(task_id)

        sql = f"UPDATE background_tasks SET {', '.join(sets)} WHERE id = ?"
        await db.execute(sql, tuple(vals))

        # Читаем актуальное состояние для рассылки
        t_row = await db.fetch_one("SELECT * FROM background_tasks WHERE id = ?", (task_id,))
        if t_row:
            await broadcaster.broadcast({
                "type": "task_update",
                "task": dict(t_row)
            })

    def is_cancelled(self, task_id: str) -> bool:
        """Проверяет, запрошена ли остановка задачи."""
        return self.stop_flags.get(task_id, False)

    async def wait_if_paused(self, task_id: str):
        """Приостанавливает выполнение корутины, если задача поставлена на паузу."""
        ev = self.pause_events.get(task_id)
        if ev:
            await ev.wait()

    async def pause_task(self, task_id: str):
        ev = self.pause_events.get(task_id)
        if ev:
            ev.clear()
            await self.update_progress(task_id, status="paused", log_line="Задача поставлена на паузу")

    async def resume_task(self, task_id: str):
        ev = self.pause_events.get(task_id)
        if ev:
            ev.set()
            await self.update_progress(task_id, status="running", log_line="Задача возобновлена")

    async def cancel_task(self, task_id: str):
        self.stop_flags[task_id] = True
        # Размораживаем если была на паузе чтобы корутина могла завершиться
        ev = self.pause_events.get(task_id)
        if ev:
            ev.set()
        await self.update_progress(task_id, status="cancelled", log_line="Задача отменена пользователем")

    async def get_active_tasks(self) -> List[Dict[str, Any]]:
        """Возвращает задачи в статусах running или paused."""
        sql = "SELECT * FROM background_tasks WHERE status IN ('running', 'paused') ORDER BY updated_at DESC"
        return await db.fetch_all(sql)

task_engine = TaskEngine.get_instance()
