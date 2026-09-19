import asyncio
import time
import json
from pathlib import Path
from typing import Dict, Optional, Any, List, Tuple
from telethon import TelegramClient, events
from telethon.errors import (
    SessionPasswordNeededError, PhoneCodeInvalidError, PhoneCodeExpiredError,
    PasswordHashInvalidError, FloodWaitError, UserDeactivatedError,
    AuthKeyDuplicatedError, UserDeactivatedBanError
)
from app.core.config import SESSIONS_DIR, settings
from app.core.logger import logger
from app.db.database import db
from app.telegram.session_loader import load_session_credentials
from app.telegram.device_profiles import get_random_mobile_profile, resolve_device_profile
from app.telegram.proxy_dispatcher import build_telethon_proxy
from app.telegram.events_dispatcher import handle_new_message, handle_message_read, broadcaster

class ClientManager:
    """
    Централизованный менеджер пула клиентов Telethon.
    Управляет жизненным циклом, подключениями, проксированием и диспетчеризацией событий.
    """
    _instance = None

    def __init__(self):
        self.clients: Dict[str, TelegramClient] = {}          # identifier (phone/name) -> TelegramClient
        self.account_info: Dict[str, Dict[str, Any]] = {}     # identifier -> данные профиля Telegram
        self.pending_auths: Dict[str, Dict[str, Any]] = {}    # phone -> данные промежуточной авторизации по номеру
        self.client_locks: Dict[str, asyncio.Lock] = {}       # блокировки для предотвращения race conditions

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = ClientManager()
        return cls._instance

    def _get_lock(self, ident: str) -> asyncio.Lock:
        if ident not in self.client_locks:
            self.client_locks[ident] = asyncio.Lock()
        return self.client_locks[ident]

    def get_client(self, ident: str) -> Optional[TelegramClient]:
        """Возвращает активный подключенный клиент по номеру, имени сессии или ID."""
        if not ident:
            return None
        ident_str = str(ident).strip()
        clean = ident_str.lstrip("+")
        
        direct = self.clients.get(clean) or self.clients.get(ident_str) or self.clients.get(f"+{clean}")
        if direct and direct.is_connected():
            return direct
            
        for k, info in self.account_info.items():
            if ident_str in (info.get("phone"), info.get("username"), str(info.get("id"))) or clean in (str(info.get("phone", "")).lstrip("+"),):
                c = self.clients.get(k)
                if c and c.is_connected():
                    return c
                    
        # Если клиент найден, но соединение временно разорвано — инициируем неблокирующее авто-переподключение
        target = direct
        if not target:
            for k, info in self.account_info.items():
                if ident_str in (info.get("phone"), info.get("username"), str(info.get("id"))) or clean in (str(info.get("phone", "")).lstrip("+"),):
                    target = self.clients.get(k)
                    break

        if target and not target.is_connected():
            try:
                loop = asyncio.get_running_loop()
                if not getattr(target, '_is_reconnecting', False):
                    target._is_reconnecting = True
                    async def _reconnect(c=target, name=clean):
                        try:
                            await c.connect()
                            logger.info(f"[{name}] Соединение Telethon успешно восстановлено.")
                        except Exception as rec_err:
                            logger.debug(f"Auto-reconnect failed for {name}: {rec_err}")
                        finally:
                            c._is_reconnecting = False
                    loop.create_task(_reconnect())
            except RuntimeError:
                pass
                    
        return target

    async def start_account(self, session_name: str, force: bool = False) -> Tuple[bool, str]:
        """
        Запускает аккаунт по имени файла сессии.
        Читает параметры, связывает с прокси, подключает и регистрирует хэндлеры.
        """
        base_name = session_name.replace(".session", "")
        clean_name = base_name.lstrip("+")

        async with self._get_lock(clean_name):
            # Если уже запущен и не форсируем реконнект
            existing = self.get_client(clean_name)
            if existing and existing.is_connected() and not force:
                return True, "Уже подключен"

            # 1. Достаем информацию об аккаунте из БД
            acc_row = await db.fetch_one(
                "SELECT * FROM accounts WHERE session_name = ? OR phone = ? OR session_name = ?",
                (base_name, base_name, clean_name)
            )
            proxy_dict = None
            if acc_row and acc_row["proxy_id"]:
                p_row = await db.fetch_one("SELECT * FROM proxies WHERE id = ?", (acc_row["proxy_id"],))
                if p_row:
                    proxy_dict = dict(p_row)

            # 2. Загружаем учетные данные сессии и параметры эмуляции устройства
            try:
                session_obj, profile = load_session_credentials(base_name)
            except Exception as e:
                logger.error(f"Не удалось прочитать сессию {base_name}: {e}")
                await self._update_account_status(base_name, "error", f"Ошибка загрузки сессии: {e}")
                return False, str(e)

            telethon_proxy = build_telethon_proxy(proxy_dict)

            # 3. Инициализация клиента Telethon
            client = TelegramClient(
                session=session_obj,
                api_id=profile["api_id"],
                api_hash=profile["api_hash"],
                device_model=profile["device_model"],
                system_version=profile["system_version"],
                app_version=profile["app_version"],
                lang_code=profile["lang_code"],
                system_lang_code=profile["system_lang_code"],
                proxy=telethon_proxy,
                auto_reconnect=True,
                connection_retries=5,
                retry_delay=2
            )

            try:
                await client.connect()
                if not await client.is_user_authorized():
                    await client.disconnect()
                    await self._update_account_status(base_name, "unauthorized", "Сессия не авторизована / отозвана")
                    return False, "Сессия не авторизована"

                # 4. Считываем реальные данные владельца аккаунта
                me = await client.get_me()
                raw_phone = getattr(me, "phone", None)
                db_phone = acc_row["phone"] if (acc_row and acc_row.get("phone")) else ""
                phone = raw_phone or db_phone or clean_name
                clean_phone = phone.lstrip("+") if phone else clean_name
                first_name = me.first_name or ""
                last_name = me.last_name or ""
                username = me.username or ""
                user_id = me.id

                # Сохраняем клиента в реестр
                self.clients[clean_name] = client
                if phone:
                    self.clients[clean_phone] = client
                    self.clients[f"+{clean_phone}"] = client

                self.account_info[clean_phone] = {
                    "id": user_id,
                    "phone": phone,
                    "first_name": first_name,
                    "last_name": last_name,
                    "username": username
                }

                # 5. Обновляем статус в БД
                now = int(time.time())
                await db.execute("""
                    INSERT INTO accounts 
                    (session_name, phone, first_name, last_name, username, user_id, status, status_detail, last_active_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'active', 'В сети', ?)
                    ON CONFLICT(session_name) DO UPDATE SET
                        phone = excluded.phone,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        username = excluded.username,
                        user_id = excluded.user_id,
                        status = 'active',
                        status_detail = 'В сети',
                        last_active_at = excluded.last_active_at
                """, (base_name, phone, first_name, last_name, username, user_id, now))

                # 6. Регистрируем перехватчики событий
                @client.on(events.NewMessage)
                async def on_new_msg(event):
                    await handle_new_message(phone or clean_name, event)

                @client.on(events.MessageRead)
                async def on_msg_read(event):
                    await handle_message_read(phone or clean_name, event)

                logger.info(f"Аккаунт [{phone or base_name}] успешно подключен! (@{username}, ID: {user_id})")

                # Фоновая синхронизация последних диалогов (не блокирует старт)
                asyncio.create_task(self._sync_recent_dialogs(phone or clean_name, client))

                # Рассылка статуса в веб-сокет
                await broadcaster.broadcast({
                    "type": "account_status",
                    "account_name": base_name,
                    "phone": phone,
                    "status": "active",
                    "user": self.account_info[clean_phone]
                })

                return True, "Успешно подключен"

            except (UserDeactivatedError, UserDeactivatedBanError) as b_err:
                logger.error(f"Аккаунт {base_name} заблокирован Telegram: {b_err}")
                await self._update_account_status(base_name, "banned", "Аккаунт заблокирован/удален")
                return False, "Аккаунт заблокирован"
            except FloodWaitError as f_err:
                logger.warning(f"Флудвейт для {base_name}: {f_err.seconds} сек")
                until = int(time.time()) + f_err.seconds
                await self._update_account_status(base_name, "floodwait", f"Лимит {f_err.seconds} сек", floodwait_until=until)
                return False, f"FloodWait: {f_err.seconds}s"
            except Exception as e:
                logger.error(f"Ошибка подключения {base_name}: {e}", exc_info=True)
                await self._update_account_status(base_name, "error", str(e))
                return False, str(e)

    async def _update_account_status(self, session_name: str, status: str, detail: str, floodwait_until: int = 0):
        now = int(time.time())
        await db.execute("""
            UPDATE accounts 
            SET status = ?, status_detail = ?, floodwait_until = ?, last_active_at = ?
            WHERE session_name = ? OR phone = ?
        """, (status, detail, floodwait_until, now, session_name, session_name))
        
        await broadcaster.broadcast({
            "type": "account_status",
            "account_name": session_name,
            "status": status,
            "detail": detail
        })

    async def _sync_recent_dialogs(self, account_phone: str, client: TelegramClient, limit: int = 100):
        """
        Фоновая подгрузка последних диалогов в локальную базу CRM.
        Делает открытие диалогов мгновенным (Local-First).
        """
        try:
            async for d in client.iter_dialogs(limit=limit):
                chat_id = d.id
                title = d.name or "Без названия"
                unread = d.unread_count
                pinned = 1 if d.pinned else 0
                archived = 1 if d.archived else 0
                top_date = int(d.date.timestamp()) if d.date else int(time.time())

                top_text = ""
                if d.message:
                    if getattr(d.message, 'text', None):
                        top_text = d.message.text
                    elif getattr(d.message, 'photo', None):
                        top_text = "📷 Фотография"
                    elif getattr(d.message, 'voice', None):
                        top_text = "🎤 Голосовое сообщение"
                    elif getattr(d.message, 'video_note', None):
                        top_text = "📹 Видеосообщение"
                    elif getattr(d.message, 'video', None):
                        top_text = "🎥 Видео"
                    elif getattr(d.message, 'sticker', None):
                        top_text = "Стикер"
                    elif getattr(d.message, 'document', None):
                        top_text = "📎 Файл"
                    elif getattr(d.message, 'action', None):
                        top_text = "Системное сообщение"
                    else:
                        top_text = getattr(d.message, 'message', '') or "Сообщение"

                chat_type = "user"
                username = ""
                if getattr(d.entity, "bot", False):
                    chat_type = "bot"
                    if hasattr(d.entity, "username"):
                        username = d.entity.username or ""
                elif d.is_user or (chat_id > 0):
                    chat_type = "user"
                    if hasattr(d.entity, "username"):
                        username = d.entity.username or ""
                elif getattr(d.entity, "megagroup", False) or getattr(d.entity, "gigagroup", False) or d.is_group:
                    chat_type = "group"
                elif d.is_channel:
                    chat_type = "channel"

                read_outbox_max_id = getattr(getattr(d, 'dialog', None), 'read_outbox_max_id', 0)
                top_id = getattr(d.message, 'id', 0) if d.message else 0
                top_out = 1 if (d.message and getattr(d.message, 'out', False)) else 0
                    
                sql = """
                    INSERT INTO dialogs 
                    (account_phone, chat_id, chat_type, title, username, top_message_text, top_message_date, unread_count, is_pinned, is_archived, read_outbox_max_id, top_message_id, top_message_is_outgoing, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_phone, chat_id) DO UPDATE SET
                        title = excluded.title,
                        username = excluded.username,
                        top_message_text = excluded.top_message_text,
                        top_message_date = excluded.top_message_date,
                        unread_count = excluded.unread_count,
                        is_pinned = excluded.is_pinned,
                        is_archived = excluded.is_archived,
                        read_outbox_max_id = excluded.read_outbox_max_id,
                        top_message_id = excluded.top_message_id,
                        top_message_is_outgoing = excluded.top_message_is_outgoing,
                        updated_at = excluded.updated_at
                """
                now = int(time.time())
                await db.execute(sql, (
                    account_phone, chat_id, chat_type, title, username, top_text, top_date, unread, pinned, archived, read_outbox_max_id, top_id, top_out, now
                ))

                if read_outbox_max_id > 0:
                    clean = str(account_phone).strip().lstrip("+")
                    await db.execute("""
                        UPDATE messages SET is_read = 1
                        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id <= ?
                    """, (clean, f"+{clean}", chat_id, read_outbox_max_id))
                    await db.execute("""
                        UPDATE messages SET is_read = 0
                        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id > ?
                    """, (clean, f"+{clean}", chat_id, read_outbox_max_id))
            logger.info(f"[{account_phone}] Синхронизация {limit} диалогов завершена.")
            # Запускаем мягкий фоновый прогрев истории сообщений топ-диалогов в SQLite
            asyncio.create_task(self._precache_top_messages(account_phone, client))
        except Exception as e:
            logger.warning(f"[{account_phone}] Ошибка фоновой синхронизации диалогов: {e}")

    async def _precache_top_messages(self, account_phone: str, client: TelegramClient, top_count: int = 30):
        """
        Фоновый прогрев истории переписок для топ-диалогов в SQLite.
        Обеспечивает мгновенное открытие любого диалога за 1-2 мс (Zero Network Waiting).
        """
        await asyncio.sleep(2.0)
        try:
            clean = str(account_phone).strip().lstrip("+")
            rows = await db.fetch_all(
                "SELECT chat_id, title FROM dialogs WHERE (account_phone = ? OR account_phone = ?) ORDER BY is_pinned DESC, top_message_date DESC LIMIT ?",
                (clean, f"+{clean}", top_count)
            )
            for r in rows:
                chat_id = r["chat_id"]
                cnt_row = await db.fetch_one(
                    "SELECT COUNT(*) as cnt FROM messages WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?",
                    (clean, f"+{clean}", chat_id)
                )
                if cnt_row and cnt_row["cnt"] >= 15:
                    continue  # Уже закэшировано

                if not client or not client.is_connected():
                    break

                try:
                    msgs = await asyncio.wait_for(client.get_messages(chat_id, limit=30), timeout=4.0)
                    batch = []
                    for m in msgs:
                        from app.telegram.events_dispatcher import get_media_info, extract_buttons
                        m_type, _, meta = get_media_info(m)
                        btns = extract_buttons(m)
                        m_date = int(m.date.timestamp()) if m.date else int(time.time())
                        batch.append((
                            clean, chat_id, m.id, m.sender_id, m.text or "", m_date,
                            1 if m.out else 0, 1 if m.out else 0, m_type,
                            json.dumps(meta) if meta else None,
                            json.dumps(btns) if btns else None
                        ))
                    if batch:
                        sql_ins = """
                            INSERT OR IGNORE INTO messages 
                            (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, media_type, media_metadata, buttons_json)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """
                        await db.executemany(sql_ins, batch)
                except Exception as c_err:
                    logger.debug(f"Pre-caching chat {chat_id} on {clean}: {c_err}")

                # Мягкая пауза 0.35s между чатами — безопасно для rate limit Telegram
                await asyncio.sleep(0.35)
            logger.info(f"[{account_phone}] Фоновый прогрев топ-{top_count} переписок завершен.")
        except Exception as e:
            logger.debug(f"[{account_phone}] Ошибка фонового прогрева переписок: {e}")

    # ==================== АВТОРИЗАЦИЯ ПО НОМЕРУ ТЕЛЕФОНА ====================

    async def start_phone_auth(self, phone: str, proxy_id: Optional[int] = None) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Инициирует вход по номеру телефона:
        - Выбирает параметры реального смартфона (эмуляция мобильного устройства).
        - Подключается через назначенный прокси (если есть).
        - Запрашивает код в официальное приложение Telegram (не SMS!).
        """
        clean_phone = phone.strip().replace(" ", "").replace("-", "")
        if not clean_phone.startswith("+"):
            clean_phone = "+" + clean_phone

        profile = get_random_mobile_profile()
        session_file = SESSIONS_DIR / f"{clean_phone}.session"

        proxy_dict = None
        if proxy_id:
            p_row = await db.fetch_one("SELECT * FROM proxies WHERE id = ?", (proxy_id,))
            if p_row:
                proxy_dict = dict(p_row)

        telethon_proxy = build_telethon_proxy(proxy_dict)

        client = TelegramClient(
            session=str(session_file.with_suffix("")),
            api_id=profile["api_id"],
            api_hash=profile["api_hash"],
            device_model=profile["device_model"],
            system_version=profile["system_version"],
            app_version=profile["app_version"],
            lang_code=profile["lang_code"],
            system_lang_code=profile["system_lang_code"],
            proxy=telethon_proxy
        )

        try:
            await client.connect()
            result = await client.send_code_request(clean_phone)
            
            self.pending_auths[clean_phone] = {
                "client": client,
                "phone_code_hash": result.phone_code_hash,
                "profile": profile,
                "proxy_id": proxy_id,
                "created_at": time.time()
            }
            logger.info(f"Код авторизации отправлен для {clean_phone} (hash: {result.phone_code_hash})")
            return True, "Код отправлен в приложение Telegram", {"phone": clean_phone}
        except Exception as e:
            logger.error(f"Ошибка отправки кода на {clean_phone}: {e}")
            if client.is_connected():
                await client.disconnect()
            return False, str(e), {}

    async def complete_phone_auth(self, phone: str, code: str, password: Optional[str] = None) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Завершает авторизацию: ввод кода и 2FA облачного пароля.
        Если пароль неверный — не сбрасывает сессию, а возвращает запрос пароля повторно!
        """
        clean_phone = phone.strip().replace(" ", "").replace("-", "")
        if not clean_phone.startswith("+"):
            clean_phone = "+" + clean_phone

        pending = self.pending_auths.get(clean_phone)
        if not pending:
            return False, "Сессия авторизации истекла или не найдена. Начните заново.", {}

        client: TelegramClient = pending["client"]
        code_hash = pending["phone_code_hash"]

        try:
            if not password:
                try:
                    await client.sign_in(clean_phone, code, phone_code_hash=code_hash)
                except SessionPasswordNeededError:
                    return True, "need_password", {"need_password": True, "phone": clean_phone}
            else:
                # Ввод 2FA пароля
                await client.sign_in(password=password)

            # Авторизация успешна! Сохраняем профиль устройства в .json рядом
            json_path = SESSIONS_DIR / f"{clean_phone}.json"
            try:
                import json
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(pending["profile"], f, indent=2, ensure_ascii=False)
            except Exception:
                pass

            # Запускаем в рабочем пуле
            self.pending_auths.pop(clean_phone, None)
            success, msg = await self.start_account(clean_phone)
            return success, msg, {"phone": clean_phone}

        except PasswordHashInvalidError:
            return False, "Неверный 2FA пароль. Попробуйте еще раз.", {"need_password": True}
        except (PhoneCodeInvalidError, PhoneCodeExpiredError) as c_err:
            return False, f"Ошибка кода: {c_err}", {}
        except Exception as e:
            logger.error(f"Ошибка завершения авторизации {clean_phone}: {e}")
            return False, str(e), {}

client_manager = ClientManager.get_instance()
