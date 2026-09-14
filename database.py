from contextlib import asynccontextmanager
import aiosqlite

DB_PATH = "farm.db"

@asynccontextmanager
async def get_db():
    """Надёжное соединение с БД с предустановленными таймаутами 60с и защитой от блокировок."""
    async with aiosqlite.connect(DB_PATH, timeout=60.0) as db:
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA busy_timeout = 60000;")
        await db.execute("PRAGMA synchronous = NORMAL;")
        yield db

async def execute_query(sql: str, params: tuple = ()):
    """Выполняет запрос на запись с автоматическим коммитом и защитой от busy_timeout."""
    async with get_db() as db:
        cursor = await db.execute(sql, params)
        await db.commit()
        return cursor

async def execute_batch(sql: str, seq_of_params: list):
    """Пакетное выполнение запросов для массовой вставки/обновления (батчинг)."""
    if not seq_of_params:
        return 0
    async with get_db() as db:
        cursor = await db.executemany(sql, seq_of_params)
        await db.commit()
        return cursor.rowcount

async def fetch_all(sql: str, params: tuple = ()) -> list[dict]:
    """Выполняет SELECT и возвращает список словарей."""
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(sql, params)
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

async def fetch_one(sql: str, params: tuple = ()) -> dict | None:
    """Выполняет SELECT и возвращает одну запись в виде словаря."""
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(sql, params)
        row = await cursor.fetchone()
        return dict(row) if row else None

async def init_db():
    async with aiosqlite.connect(DB_PATH, timeout=30.0) as db:
        # Режим высокой производительности и параллелизма (WAL)
        await db.execute("PRAGMA journal_mode = WAL;")
        await db.execute("PRAGMA synchronous = NORMAL;")
        await db.execute("PRAGMA busy_timeout = 30000;")
        await db.execute("PRAGMA temp_store = MEMORY;")
        await db.execute("PRAGMA mmap_size = 268435456;")
        await db.execute("PRAGMA cache_size = -64000;")
        # Таблица 1: Аккаунты
        await db.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                phone TEXT,
                work_group_id INTEGER,
                proxy_id INTEGER,
                device_fingerprint TEXT
            )
        """)

        # Таблица 2: Рабочие группы
        await db.execute("""
            CREATE TABLE IF NOT EXISTS work_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE
            )
        """)

        # Таблица 3: Группы прокси (Proxy Pools / Groups)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS proxy_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT UNIQUE NOT NULL,
                created_at INTEGER
            )
        """)

        # Таблица 3.1: Прокси
        await db.execute("""
            CREATE TABLE IF NOT EXISTS proxies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host TEXT,
                port INTEGER,
                username TEXT,
                password TEXT,
                linked_group_id INTEGER,
                proxy_group_id INTEGER,
                status TEXT DEFAULT 'unknown',
                ping_ms INTEGER DEFAULT 0,
                last_check INTEGER DEFAULT 0
            )
        """)

        # Миграция колонок для существующих баз данных
        try:
            cursor = await db.execute("PRAGMA table_info(proxies)")
            existing_cols = [r[1] for r in await cursor.fetchall()]
            if "proxy_group_id" not in existing_cols:
                await db.execute("ALTER TABLE proxies ADD COLUMN proxy_group_id INTEGER")
            if "status" not in existing_cols:
                await db.execute("ALTER TABLE proxies ADD COLUMN status TEXT DEFAULT 'unknown'")
            if "ping_ms" not in existing_cols:
                await db.execute("ALTER TABLE proxies ADD COLUMN ping_ms INTEGER DEFAULT 0")
            if "last_check" not in existing_cols:
                await db.execute("ALTER TABLE proxies ADD COLUMN last_check INTEGER DEFAULT 0")
        except Exception:
            pass

        # Таблица 4: Сообщения (Глобальная лента)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account TEXT,
                chat_id INTEGER,
                message_id INTEGER,
                chat_title TEXT,
                text TEXT,
                date INTEGER,
                is_outgoing BOOLEAN,
                is_read BOOLEAN DEFAULT 0
            )
        """)

        # Таблица 5: Спарсенные лиды
        await db.execute("""
            CREATE TABLE IF NOT EXISTS scraped_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT,
                user_id INTEGER,
                first_name TEXT,
                last_name TEXT,
                phone TEXT,
                source_chat TEXT,
                created_at INTEGER,
                status TEXT DEFAULT 'new'
            )
        """)

        # Индекс для исключения повторных записей одного пользователя
        await db.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user ON scraped_leads(user_id) WHERE user_id IS NOT NULL
        """)

        # Таблица 6: Фоновые задачи
        await db.execute("""
            CREATE TABLE IF NOT EXISTS background_tasks (
                id TEXT PRIMARY KEY,
                task_type TEXT,
                status TEXT,
                progress INTEGER DEFAULT 0,
                total INTEGER DEFAULT 0,
                processed INTEGER DEFAULT 0,
                log TEXT,
                account_names TEXT,
                config TEXT,
                state_json TEXT,
                created_at INTEGER
            )
        """)

        # Миграция колонок background_tasks для существующих баз данных
        try:
            cursor = await db.execute("PRAGMA table_info(background_tasks)")
            bt_cols = [r[1] for r in await cursor.fetchall()]
            if "config" not in bt_cols:
                await db.execute("ALTER TABLE background_tasks ADD COLUMN config TEXT")
            if "state_json" not in bt_cols:
                await db.execute("ALTER TABLE background_tasks ADD COLUMN state_json TEXT")
        except Exception:
            pass

        # Таблица 7: Взаимные симпатии (Дайвинчик / leomatchbot)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS leomatch_matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name TEXT NOT NULL,
                lead_user_id INTEGER,
                lead_username TEXT,
                lead_name TEXT,
                lead_info TEXT,
                message_text TEXT,
                created_at INTEGER NOT NULL
            )
        """)

        # Таблица 8: Группы лидов (Lead Groups)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS lead_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                color TEXT DEFAULT '#00a8ff',
                created_at INTEGER
            )
        """)

        # Таблица 9: Профили лидов и пометки (Lead Profiles)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS lead_profiles (
                chat_id INTEGER PRIMARY KEY,
                account_name TEXT,
                title TEXT,
                username TEXT,
                notes TEXT,
                group_ids TEXT DEFAULT '',
                updated_at INTEGER
            )
        """)

        # Заполнение дефолтных групп лидов
        cursor = await db.execute("SELECT COUNT(*) FROM lead_groups")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            import time
            now = int(time.time())
            defaults = [
                ("Собеседование", "#00a8ff"),
                ("Стажировка", "#2ed573"),
                ("В работе", "#ffa502"),
                ("Отказ", "#ff4757"),
                ("Клиент", "#b53cff")
            ]
            for gname, gcolor in defaults:
                try:
                    await db.execute(
                        "INSERT INTO lead_groups (name, color, created_at) VALUES (?, ?, ?)",
                        (gname, gcolor, now)
                    )
                except Exception:
                    pass

        # Таблица 10: Быстрые ответы и заготовки (Quick Replies & Voice Presets)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS quick_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                reply_type TEXT NOT NULL,
                category TEXT DEFAULT 'Общее',
                content_text TEXT,
                file_path TEXT,
                duration INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        """)

        # Заполнение дефолтных заготовок
        cursor = await db.execute("SELECT COUNT(*) FROM quick_replies")
        row = await cursor.fetchone()
        if row and row[0] == 0:
            import time
            now = int(time.time())
            default_replies = [
                ("Приветствие", "text", "Первый контакт", "{Привет|Здравствуйте|Добрый день}! {Чем могу помочь|Подскажите, пожалуйста, по какому вопросу обращаетесь}?", "", 0, now),
                ("Уточнение деталей", "text", "Квалификация", "Подскажите, пожалуйста, какой у вас опыт и какие задачи сейчас стоят в приоритете?", "", 0, now),
                ("Ссылка на информацию", "text", "Оффер", "Всю подробную информацию и актуальные условия вы можете изучить здесь: {https://t.me/...}", "", 0, now),
                ("Завершение диалога", "text", "Дожим", "{Спасибо за обратную связь|Договорились}! {Будем на связи|Хорошего вам дня}!", "", 0, now),
            ]
            for r_title, r_type, r_cat, r_text, r_file, r_dur, r_ts in default_replies:
                try:
                    await db.execute(
                        "INSERT INTO quick_replies (title, reply_type, category, content_text, file_path, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (r_title, r_type, r_cat, r_text, r_file, r_dur, r_ts)
                    )
                except Exception:
                    pass

        # Индексы для ускорения выборок и сортировок при масштабировании
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_acc_chat ON messages(account, chat_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_acc_date ON messages(account, date DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_accounts_name ON accounts(name)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(work_group_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_proxies_group ON proxies(proxy_group_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_proxies_linked ON proxies(linked_group_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_leomatch_matches_acc ON leomatch_matches(account_name, created_at DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_background_tasks_type_status ON background_tasks(task_type, status)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_lead_profiles_account ON lead_profiles(account_name)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_quick_replies_type ON quick_replies(reply_type, category)")

        await db.commit()