import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings, DATA_DIR, BACKEND_DIR
from app.core.logger import logger
from app.db.database import db
from app.db.init_db import init_schema
from app.telegram.client_manager import client_manager

# Роутеры
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.dialogs import router as dialogs_router
from app.api.messages import router as messages_router
from app.api.proxies import router as proxies_router
from app.api.leads import router as leads_router
from app.api.tasks import router as tasks_router
from app.api.tools import router as tools_router
from app.api.ws import router as ws_router
from app.api.media import router as media_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Запуск БД и проверка схемы
    logger.info(f"=== Запуск {settings.PROJECT_NAME} v{settings.VERSION} ===")
    await db.start()
    await init_schema()

    # 2. Индекс медиафайлов строится один раз на старте (в отдельном потоке),
    #    чтобы поиск в кэше был O(1) и не блокировал event loop через glob().
    from app.api.media import ensure_media_index
    await ensure_media_index()

    # 3. Единственный супервизор соединений вместо разрозненных reconnect-задач
    await client_manager.start_supervisor()

    # 4. Фоновый запуск ранее активных сессий
    asyncio.create_task(_auto_start_accounts())

    yield

    # Корректное завершение
    logger.info("Остановка приложения и сохранение состояния...")
    await client_manager.stop_supervisor()
    await db.stop()

async def _auto_start_accounts():
    """Фоновое подключение существующих сессий без блокировки старта сервера."""
    await asyncio.sleep(1.0)
    try:
        from app.services.account_service import get_all_accounts
        accs = await get_all_accounts()
        for a in accs:
            # Запускаем только те, что не забанены
            if a["status"] not in ["banned", "unauthorized"]:
                logger.info(f"Автозапуск сессии {a['session_name']}...")
                asyncio.create_task(client_manager.start_account(a["session_name"]))
                await asyncio.sleep(0.5)
    except Exception as e:
        logger.warning(f"Ошибка автозапуска сессий: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS для взаимодействия с фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение API роутеров
app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(dialogs_router)
app.include_router(messages_router)
app.include_router(proxies_router)
app.include_router(leads_router)
app.include_router(tasks_router)
app.include_router(tools_router)
app.include_router(ws_router)
app.include_router(media_router)

from app.api.dialogs import api_get_avatar, api_get_avatars_bulk
app.add_api_route("/api/avatar", api_get_avatar, methods=["GET"])
app.add_api_route("/api/avatars", api_get_avatars_bulk, methods=["GET"])

# Раздача медиафайлов и аватарок
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

# Раздача скомпилированного фронтенда (если dist существует)
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    async def index_placeholder():
        return {
            "project": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "status": "backend_running",
            "docs": "/docs",
            "message": "Бэкенд запущен. Фронтенд собирается или работает на dev-порту."
        }
