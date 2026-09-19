import time
from app.db.database import db
from app.core.logger import logger

async def init_schema():
    """Создание всех таблиц и индексов с дефолтными значениями."""
    logger.info("Проверка и инициализация схемы базы данных...")
    
    # 1. Таблица аккаунтов
    await db.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT,
            session_name TEXT UNIQUE NOT NULL,
            first_name TEXT DEFAULT '',
            last_name TEXT DEFAULT '',
            username TEXT DEFAULT '',
            user_id INTEGER DEFAULT 0,
            work_group_id INTEGER,
            proxy_id INTEGER,
            status TEXT DEFAULT 'offline',
            status_detail TEXT DEFAULT '',
            floodwait_until INTEGER DEFAULT 0,
            device_fingerprint TEXT,
            created_at INTEGER,
            last_active_at INTEGER
        )
    """)

    # 2. Рабочие группы аккаунтов
    await db.execute("""
        CREATE TABLE IF NOT EXISTS work_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT UNIQUE NOT NULL,
            color TEXT DEFAULT '#6366f1',
            created_at INTEGER
        )
    """)

    # 3. Пулы/группы прокси
    await db.execute("""
        CREATE TABLE IF NOT EXISTS proxy_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT UNIQUE NOT NULL,
            created_at INTEGER
        )
    """)

    # 4. Прокси
    await db.execute("""
        CREATE TABLE IF NOT EXISTS proxies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proxy_group_id INTEGER,
            proto TEXT DEFAULT 'socks5',
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            username TEXT,
            password TEXT,
            status TEXT DEFAULT 'unknown',
            ping_ms INTEGER DEFAULT 0,
            last_checked_at INTEGER DEFAULT 0
        )
    """)

    # 5. Диалоги (локальный кэш CRM)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS dialogs (
            account_phone TEXT NOT NULL,
            chat_id INTEGER NOT NULL,
            chat_type TEXT DEFAULT 'user',
            title TEXT DEFAULT '',
            username TEXT DEFAULT '',
            top_message_text TEXT DEFAULT '',
            top_message_date INTEGER DEFAULT 0,
            unread_count INTEGER DEFAULT 0,
            is_pinned BOOLEAN DEFAULT 0,
            is_archived BOOLEAN DEFAULT 0,
            avatar_path TEXT DEFAULT '',
            read_outbox_max_id INTEGER DEFAULT 0,
            top_message_id INTEGER DEFAULT 0,
            top_message_is_outgoing BOOLEAN DEFAULT 0,
            updated_at INTEGER DEFAULT 0,
            PRIMARY KEY (account_phone, chat_id)
        )
    """)

    # 6. Сообщения
    await db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_phone TEXT NOT NULL,
            chat_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            sender_id INTEGER,
            sender_name TEXT DEFAULT '',
            text TEXT DEFAULT '',
            date INTEGER NOT NULL,
            is_outgoing BOOLEAN NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            media_type TEXT,
            media_path TEXT,
            media_metadata TEXT,
            reply_to_msg_id INTEGER,
            reactions_json TEXT,
            buttons_json TEXT,
            raw_json TEXT,
            UNIQUE (account_phone, chat_id, message_id)
        )
    """)

    # 7. Группы лидов (воронка CRM)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS lead_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            color TEXT DEFAULT '#3b82f6',
            created_at INTEGER
        )
    """)

    # 8. Карточки лидов (CRM)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            chat_id INTEGER PRIMARY KEY,
            account_phone TEXT,
            first_name TEXT DEFAULT '',
            last_name TEXT DEFAULT '',
            username TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            birthday TEXT DEFAULT '',
            channel_link TEXT DEFAULT '',
            channel_title TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            lead_group_ids TEXT DEFAULT '',
            updated_at INTEGER
        )
    """)

    # 9. Быстрые ответы и шаблоны (спинтакс, аудио, кружки)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS quick_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            category TEXT DEFAULT 'Общее',
            reply_type TEXT DEFAULT 'text',
            content_text TEXT DEFAULT '',
            file_path TEXT DEFAULT '',
            duration INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    """)

    # 10. Фоновые задачи (Task Engine)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS background_tasks (
            id TEXT PRIMARY KEY,
            task_type TEXT NOT NULL,
            title TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            progress INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0,
            log TEXT DEFAULT '',
            account_phones TEXT,
            config_json TEXT,
            state_json TEXT,
            created_at INTEGER,
            updated_at INTEGER
        )
    """)

    # 11. Взаимные симпатии Дайвинчика (@leomatchbot)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS leomatch_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_phone TEXT NOT NULL,
            lead_user_id INTEGER,
            lead_username TEXT DEFAULT '',
            lead_name TEXT DEFAULT '',
            lead_age INTEGER DEFAULT 0,
            lead_city TEXT DEFAULT '',
            lead_bio TEXT DEFAULT '',
            avatar_path TEXT DEFAULT '',
            raw_message TEXT DEFAULT '',
            status TEXT DEFAULT 'new',
            created_at INTEGER NOT NULL
        )
    """)

    # Индексы для сверхбыстрого чтения
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_acc_phone ON accounts(phone)",
        "CREATE INDEX IF NOT EXISTS idx_acc_group ON accounts(work_group_id)",
        "CREATE INDEX IF NOT EXISTS idx_proxies_group ON proxies(proxy_group_id)",
        "CREATE INDEX IF NOT EXISTS idx_dialogs_acc_date ON dialogs(account_phone, top_message_date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_dialogs_acc_pinned ON dialogs(account_phone, is_pinned DESC)",
        "CREATE INDEX IF NOT EXISTS idx_dialogs_filter ON dialogs(account_phone, is_archived, is_pinned DESC, top_message_date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_dialogs_peer ON dialogs(chat_id)",
        "CREATE INDEX IF NOT EXISTS idx_msgs_lookup ON messages(account_phone, chat_id, message_id DESC)",
        "CREATE INDEX IF NOT EXISTS idx_msgs_date ON messages(date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_msgs_read_sync ON messages(account_phone, chat_id, is_outgoing, is_read, message_id)",
        "CREATE INDEX IF NOT EXISTS idx_msgs_media ON messages(account_phone, chat_id, media_type)",
        "CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON background_tasks(task_type, status)",
        "CREATE INDEX IF NOT EXISTS idx_matches_acc ON leomatch_matches(account_phone, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_leads_account ON leads(account_phone)"
    ]
    for idx in indexes:
        await db.execute(idx)

    # Дефолтные группы лидов
    existing_lg = await db.fetch_one("SELECT COUNT(*) as cnt FROM lead_groups")
    if existing_lg and existing_lg["cnt"] == 0:
        now = int(time.time())
        default_groups = [
            ("Собеседование", "#00a8ff"),
            ("Стажировка", "#2ed573"),
            ("В работе", "#ffa502"),
            ("Отказ", "#ff4757"),
            ("Клиент", "#a855f7")
        ]
        for name, color in default_groups:
            await db.execute(
                "INSERT INTO lead_groups (name, color, created_at) VALUES (?, ?, ?)",
                (name, color, now)
            )

    # Дефолтные шаблоны быстрых ответов
    existing_qr = await db.fetch_one("SELECT COUNT(*) as cnt FROM quick_replies")
    if existing_qr and existing_qr["cnt"] == 0:
        now = int(time.time())
        default_replies = [
            ("Приветствие", "Первый контакт", "text", "{Привет|Здравствуйте|Добрый день}! {Чем могу помочь|Подскажите, пожалуйста, по какому вопросу обращаетесь}?"),
            ("Уточнение опыта", "Квалификация", "text", "Подскажите, пожалуйста, какой у вас опыт и какие задачи сейчас стоят в приоритете?"),
            ("Подтверждение", "Завершение", "text", "{Договорились|Отлично}! {Будем на связи|Хорошего дня}!")
        ]
        for title, cat, rtype, text in default_replies:
            await db.execute(
                "INSERT INTO quick_replies (title, category, reply_type, content_text, created_at) VALUES (?, ?, ?, ?, ?)",
                (title, cat, rtype, text, now)
            )

    # Миграции схемы (проверка наличия новых колонок)
    try:
        dialog_cols = [r["name"] for r in await db.fetch_all("PRAGMA table_info(dialogs)")]
        if "top_message_id" not in dialog_cols:
            await db.execute("ALTER TABLE dialogs ADD COLUMN top_message_id INTEGER DEFAULT 0")
        if "top_message_is_outgoing" not in dialog_cols:
            await db.execute("ALTER TABLE dialogs ADD COLUMN top_message_is_outgoing BOOLEAN DEFAULT 0")
        
        # Исправление chat_type: положительные ID в Telegram — это всегда пользователи, а не каналы
        await db.execute("UPDATE dialogs SET chat_type = 'user' WHERE chat_id > 0 AND chat_type = 'channel'")

        lead_cols = [r["name"] for r in await db.fetch_all("PRAGMA table_info(leads)")]
        if "channel_title" not in lead_cols:
            await db.execute("ALTER TABLE leads ADD COLUMN channel_title TEXT DEFAULT ''")

        # Заполнение top_message_id и top_message_is_outgoing для существующих диалогов из messages
        await db.execute("""
            UPDATE dialogs
            SET 
                top_message_id = COALESCE((
                    SELECT m.message_id FROM messages m 
                    WHERE (m.account_phone = dialogs.account_phone OR m.account_phone = '+' || dialogs.account_phone OR '+' || m.account_phone = dialogs.account_phone) 
                      AND m.chat_id = dialogs.chat_id 
                    ORDER BY m.message_id DESC LIMIT 1
                ), 0),
                top_message_is_outgoing = COALESCE((
                    SELECT m.is_outgoing FROM messages m 
                    WHERE (m.account_phone = dialogs.account_phone OR m.account_phone = '+' || dialogs.account_phone OR '+' || m.account_phone = dialogs.account_phone) 
                      AND m.chat_id = dialogs.chat_id 
                    ORDER BY m.message_id DESC LIMIT 1
                ), 0)
            WHERE top_message_id = 0
        """)
    except Exception as e:
        logger.warning(f"Ошибка применения миграций схемы БД: {e}")

    logger.info("Схема базы данных успешно создана и заполнена начальными данными.")
