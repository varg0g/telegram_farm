# Telegram Farm CRM Architecture & Development Rules

## Стек и технологии
- **Backend**: Python 3.11+, FastAPI, Telethon (MTProto), aiosqlite / SQLite (`backend/data/crm.db`), WebSockets.
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, WebSockets (`ws://127.0.0.1:8000/ws`).
- **Среда запуска**: Windows, PowerShell / cmd. Для сборки фронтенда использовать `cmd /c "npm run build"`.

---

## Архитектурные границы (Строго соблюдать!)

### 1. Управление клиентами Telegram (`backend/app/telegram/client_manager.py`)
- Все клиенты `TelegramClient` создаются, подключаются и управляются **ТОЛЬКО** внутри `ClientManager`.
- **СТРОГО ЗАПРЕЩЕНО** вызывать `TelegramClient.connect()`, `start()`, `disconnect()` напрямую внутри роутеров FastAPI (`backend/app/api/...`).
- Доступ к клиентам осуществляется исключительно через `client_manager.get_client(phone)`.

### 2. Диспетчеризация событий и WebSockets (`backend/app/telegram/events_dispatcher.py`)
- Все входящие/исходящие сообщения, статусы прочтения и события перехватываются через обработчики `events_dispatcher.py`.
- Все события в веб-интерфейс рассылаются через синглтон `broadcaster.broadcast(event_dict)`.
- В WebSocket-событии `new_message` объект сообщения **обязан** содержать и `id: msg_id`, и `message_id: msg_id` (Telegram message ID).

### 3. Модули автоматизации (`backend/app/modules/`)
- Модули («Дайвинчик» / `leomatch`, редактор профилей `profile_editor`, парсер `scraper`, рассыльщик `sender`) должны быть полностью изолированы от API-роутеров. Роутеры лишь запускают задачи в фоне или вызывают методы модуля.
- Во всех вызовах Telethon **обязателен** перехват `FloodWaitError`:
  ```python
  except FloodWaitError as e:
      logger.warning(f"FloodWait on {phone}: sleep {e.seconds + 2}s")
      await asyncio.sleep(e.seconds + 2)
  ```
- Обрабатывать `SessionPasswordNeededError` и другие ошибки авторизации без падения бэкенда.

### 4. База данных и сопоставление ID сообщений
- Основная база: `backend/data/crm.db` (режим WAL).
- Таблицы: `accounts`, `messages`, `dialogs`, `leads`, `lead_groups`, `proxies`, `leomatch_matches`, `tasks`.
- **КРИТИЧЕСКИ ВАЖНО**: В таблице `messages`:
  - `id` — внутренний автоинкрементный номер строки SQLite.
  - `message_id` — реальный ID сообщения Telegram.
  - Любые медиа-запросы, сопоставления и ссылки на сообщения во фронтенде и бэкенде **ДОЛЖНЫ** использовать `message_id` (например, `const msgId = m.message_id || m.id;`).
  - При выборке сообщений в `chat_service.py` поле `d["id"]` приводится к `message_id`.

### 5. Стриминг и кэш медиафайлов (`backend/app/api/media.py`)
- Медиа сохраняется по шаблону `backend/data/media/{clean_phone}_{chat_id}_{message_id}.{ext}`.
- Аудио голосовых сообщений отдается с MIME-типом `audio/ogg` с поддержкой Range-запросов (206) и HEAD-запросов.
- Запрещено блокировать сервер синхронной загрузкой тяжелых медиа — используется `_media_semaphore = asyncio.Semaphore(8)`.

### 6. Звуковые уведомления фронтенда (`frontend/src/utils/sound.js`)
- Все звуки воспроизводятся строго через модуль `sound.js` с использованием единого `AudioContext`, аппаратного `DynamicsCompressorNode` (защита от клиппинга) и кулдауна (1400 мс).
- Каналы (`chat_type === 'channel'`) и архивные диалоги не должны издавать звуковых уведомлений.

---

## Правила внесения изменений для ИИ-ассистента

1. **Точечные правки**: Запрещено переписывать файлы целиком вслепую. Все изменения делать через замену точных блоков кода.
2. **Проверка схемы БД**: Перед написанием SQL-запросов обязательно проверять реальную структуру колонок в `data/crm.db`.
3. **Верификация**: После любых изменений фронтенда запускать `cmd /c "npm run build"`, а после изменений бэкенда — проверять синтаксис и запуск uvicorn.
