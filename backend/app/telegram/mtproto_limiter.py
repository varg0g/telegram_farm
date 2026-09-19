import asyncio
from contextlib import asynccontextmanager
from typing import Dict


class MtprotoLimiter:
    """
    Единый ограничитель параллелизма для тяжёлых MTProto-операций
    (скачивание медиа, аватарок, фоновый прогрев истории).

    Зачем нужен:
      - Глобальный лимит защищает event loop и соединения Telegram от залповых запросов
        (без него 70 аккаунтов одновременно забивают канал и ловят FloodWait).
      - Лимит на аккаунт не даёт одному «шумному» аккаунту занять всю квоту фермы.
    """

    def __init__(self, global_limit: int = 12, per_account_limit: int = 3):
        self._global = asyncio.Semaphore(global_limit)
        self._per_account: Dict[str, asyncio.Semaphore] = {}
        self._per_account_limit = per_account_limit
        self.global_limit = global_limit
        self.per_account_limit = per_account_limit

    def _account_sem(self, account: str) -> asyncio.Semaphore:
        key = str(account or "").strip().lstrip("+")
        sem = self._per_account.get(key)
        if sem is None:
            sem = asyncio.Semaphore(self._per_account_limit)
            self._per_account[key] = sem
        return sem

    @asynccontextmanager
    async def slot(self, account: str):
        async with self._account_sem(account):
            async with self._global:
                yield


# Скачивание медиа: умеренный параллелизм, чтобы не блокировать UI.
media_limiter = MtprotoLimiter(global_limit=12, per_account_limit=3)

# Аватарки: отдельная, более щадящая квота — это не критичный для работы контент.
avatar_limiter = MtprotoLimiter(global_limit=8, per_account_limit=2)
