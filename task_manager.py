import asyncio
from typing import Dict, List, Optional, Set, Tuple
from contextlib import asynccontextmanager
from logger import logger
from database import execute_query

class TaskManager:
    """
    Централизованный менеджер фоновых задач и блокировок аккаунтов (AccountLock).
    Предотвращает одновременный запуск конфликтующих задач на одном и том же аккаунте.
    """
    def __init__(self):
        self._lock = asyncio.Lock()
        # account_name -> {"task_id": str, "task_type": str}
        self.account_locks: Dict[str, Dict[str, str]] = {}
        # task_id -> asyncio.Task
        self.running_tasks: Dict[str, asyncio.Task] = {}
        # task_id set
        self.task_stop_flags: Set[str] = set()

    async def is_account_busy(self, account_name: str) -> Optional[Dict[str, str]]:
        async with self._lock:
            return self.account_locks.get(account_name)

    async def try_acquire_accounts(
        self, account_names: List[str], task_id: str, task_type: str
    ) -> Tuple[bool, List[str]]:
        """
        Пытается атомарно захватить список аккаунтов для задачи task_id.
        Если хоть один аккаунт уже занят другой задачей, возвращает (False, [список занятых аккаунтов]).
        Если все свободны — блокирует их за task_id и возвращает (True, []).
        """
        async with self._lock:
            busy = []
            for name in account_names:
                if name in self.account_locks:
                    info = self.account_locks[name]
                    if info.get("task_id") != task_id:
                        busy.append(f"{name} (занят задачей {info.get('task_type', 'unknown')})")

            if busy:
                return False, busy

            for name in account_names:
                self.account_locks[name] = {"task_id": task_id, "task_type": task_type}

            return True, []

    async def release_accounts(self, account_names: List[str], task_id: str):
        """Освобождает блокировку аккаунтов, если они принадлежат task_id."""
        async with self._lock:
            for name in account_names:
                if self.account_locks.get(name, {}).get("task_id") == task_id:
                    self.account_locks.pop(name, None)

    async def register_task(self, task_id: str, task: asyncio.Task):
        async with self._lock:
            self.running_tasks[task_id] = task

    async def unregister_task(self, task_id: str):
        async with self._lock:
            self.running_tasks.pop(task_id, None)
            self.task_stop_flags.discard(task_id)

    def is_task_stopped(self, task_id: str) -> bool:
        return task_id in self.task_stop_flags

    def set_stop_flag(self, task_id: str):
        self.task_stop_flags.add(task_id)

    async def stop_task(self, task_id: str) -> bool:
        """Останавливает задачу и отменяет asyncio.Task"""
        self.set_stop_flag(task_id)
        async with self._lock:
            task = self.running_tasks.get(task_id)
            if task and not task.done():
                task.cancel()
                return True
        return False

    @asynccontextmanager
    async def task_scope(self, task_id: str, account_names: List[str], task_type: str):
        """
        Контекстный менеджер безопасного жизненного цикла задачи.
        Гарантирует освобождение блокировок аккаунтов и очистку словарей при любом исходе.
        """
        try:
            yield
        except asyncio.CancelledError:
            logger.info(f"Задача {task_id} ({task_type}) отменена пользователем.")
            try:
                await execute_query(
                    "UPDATE background_tasks SET status = 'stopped', log = 'Остановлено пользователем' WHERE id = ?",
                    (task_id,)
                )
            except Exception:
                pass
            raise
        except Exception as e:
            logger.exception(f"Исключение в задаче {task_id} ({task_type}): {e}")
            try:
                await execute_query(
                    "UPDATE background_tasks SET status = 'failed', log = ? WHERE id = ?",
                    (f"Ошибка: {str(e)[:200]}", task_id)
                )
            except Exception:
                pass
            raise
        finally:
            await self.release_accounts(account_names, task_id)
            await self.unregister_task(task_id)
            logger.info(f"Задача {task_id} ({task_type}) завершила работу, ресурсы освобождены.")

task_manager = TaskManager()
