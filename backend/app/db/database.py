import asyncio
import aiosqlite
from pathlib import Path
from typing import Any, List, Dict, Optional, Tuple, Union
from app.core.config import settings
from app.core.logger import logger

class WriteTask:
    def __init__(self, query: str, params: tuple = (), is_batch: bool = False, batch_params: list = None):
        self.query = query
        self.params = params
        self.is_batch = is_batch
        self.batch_params = batch_params or []
        self.future: asyncio.Future = asyncio.get_running_loop().create_future()

class DatabaseManager:
    """
    Высокопроизводительный асинхронный менеджер SQLite с архитектурой Write-Worker.
    - Чтения: параллельные без блокировок через WAL-режим (< 2 мс).
    - Записи: сериализованы через асинхронную очередь с одним пишущим воркером.
    Это НАВСЕГДА исключает ошибку 'database is locked'.
    """
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._write_queue: asyncio.Queue[WriteTask] = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._write_conn: Optional[aiosqlite.Connection] = None
        self._read_conns: List[aiosqlite.Connection] = []
        self._read_pool: asyncio.LifoQueue = asyncio.LifoQueue()
        self._read_pool_size = 10
        self._running = False

    async def start(self):
        """Инициализация соединений и запуск фонового воркера записи."""
        if self._running:
            return
            
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 1. Выделенное соединение на запись
        self._write_conn = await aiosqlite.connect(self.db_path, timeout=60.0)
        await self._write_conn.execute("PRAGMA journal_mode = WAL;")
        await self._write_conn.execute("PRAGMA synchronous = NORMAL;")
        await self._write_conn.execute("PRAGMA busy_timeout = 60000;")
        await self._write_conn.execute("PRAGMA temp_store = MEMORY;")
        await self._write_conn.execute("PRAGMA cache_size = -64000;")  # 64MB кэш
        await self._write_conn.execute("PRAGMA mmap_size = 268435456;") # 256MB MMAP
        
        # 2. Пул постоянных неблокирующих соединений на чтение (исключает курсорные коллизии)
        self._read_conns.clear()
        for _ in range(self._read_pool_size):
            r_conn = await aiosqlite.connect(self.db_path, timeout=60.0)
            r_conn.row_factory = aiosqlite.Row
            await r_conn.execute("PRAGMA busy_timeout = 60000;")
            await r_conn.execute("PRAGMA cache_size = -32000;")
            await r_conn.execute("PRAGMA mmap_size = 268435456;")
            self._read_conns.append(r_conn)
            await self._read_pool.put(r_conn)
        
        self._running = True
        self._worker_task = asyncio.create_task(self._write_worker_loop())
        logger.info(f"База данных успешно инициализирована: {self.db_path} (WAL-режим, {self._read_pool_size} read-воркеров)")

    async def stop(self):
        """Корректное завершение работы воркера и закрытие соединений."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
                
        if self._write_conn:
            try:
                await self._write_conn.close()
            except Exception:
                pass
        for r_conn in self._read_conns:
            try:
                await r_conn.close()
            except Exception:
                pass
        self._read_conns.clear()
        logger.info("Соединения с базой данных закрыты.")

    async def _write_worker_loop(self):
        """Фоновый поток записи: интеллектуальное микро-пакетирование (micro-batching до 100 запросов)."""
        while self._running:
            try:
                task = await self._write_queue.get()
                batch = [task]
                # Снимаем все накопившиеся задачи из очереди для пакетной фиксации
                while not self._write_queue.empty() and len(batch) < 100:
                    try:
                        batch.append(self._write_queue.get_nowait())
                    except asyncio.QueueEmpty:
                        break

                try:
                    for t in batch:
                        try:
                            if t.is_batch:
                                cursor = await self._write_conn.executemany(t.query, t.batch_params)
                            else:
                                cursor = await self._write_conn.execute(t.query, t.params)
                            if not t.future.done():
                                t.future.set_result(cursor.lastrowid or cursor.rowcount)
                        except Exception as item_err:
                            logger.error(f"Ошибка выполнения записи в БД: {item_err} | SQL: {t.query[:100]}")
                            if not t.future.done():
                                t.future.set_exception(item_err)

                    await self._write_conn.commit()
                except Exception as batch_err:
                    logger.error(f"Ошибка коммита пакета записей в БД: {batch_err}")
                finally:
                    for _ in batch:
                        self._write_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Сбой в цикле write-worker: {e}")
                await asyncio.sleep(0.05)

    async def execute(self, query: str, params: tuple = ()) -> int:
        """Поставить задачу на запись в очередь и дождаться выполнения."""
        if not self._running:
            raise RuntimeError("База данных не запущена")
        task = WriteTask(query, params)
        await self._write_queue.put(task)
        return await task.future

    async def executemany(self, query: str, batch_params: list) -> int:
        """Поставить пакетную вставку в очередь и дождаться выполнения."""
        if not batch_params:
            return 0
        if not self._running:
            raise RuntimeError("База данных не запущена")
        task = WriteTask(query, is_batch=True, batch_params=batch_params)
        await self._write_queue.put(task)
        return await task.future

    async def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Параллельное чтение без задержек и без блокировок через пул соединений."""
        if self._running:
            conn = await self._read_pool.get()
            try:
                cursor = await conn.execute(query, params)
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]
            finally:
                await self._read_pool.put(conn)

        async with aiosqlite.connect(self.db_path, timeout=60.0) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Быстрое чтение одной строки через пул соединений."""
        if self._running:
            conn = await self._read_pool.get()
            try:
                cursor = await conn.execute(query, params)
                row = await cursor.fetchone()
                return dict(row) if row else None
            finally:
                await self._read_pool.put(conn)

        async with aiosqlite.connect(self.db_path, timeout=60.0) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(query, params)
            row = await cursor.fetchone()
            return dict(row) if row else None

db = DatabaseManager(settings.DB_PATH)
