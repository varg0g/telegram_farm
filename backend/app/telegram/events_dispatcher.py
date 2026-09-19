import asyncio
import time
import json
from telethon import events
from telethon.tl.custom import Message
from telethon.tl.types import (
    User, Chat, Channel, MessageMediaPhoto, MessageMediaDocument,
    DocumentAttributeAudio, DocumentAttributeVideo, DocumentAttributeSticker
)
from app.db.database import db
from app.core.logger import logger

class WebSocketBroadcaster:
    """Интерфейс для широковещательной рассылки событий на веб-интерфейс."""
    _instance = None
    
    def __init__(self):
        self.active_connections = set()
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = WebSocketBroadcaster()
        return cls._instance
        
    def add(self, ws):
        self.active_connections.add(ws)
        
    def remove(self, ws):
        self.active_connections.discard(ws)
        
    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        connections = list(self.active_connections)
        dead = set()

        async def _send_safe(ws):
            try:
                await asyncio.wait_for(ws.send_json(data), timeout=1.5)
            except Exception:
                dead.add(ws)

        await asyncio.gather(*[_send_safe(ws) for ws in connections], return_exceptions=True)
        for d in dead:
            self.active_connections.discard(d)

broadcaster = WebSocketBroadcaster.get_instance()

def get_media_info(msg: Message) -> tuple:
    """Извлекает тип и метаданные медиа из сообщения."""
    if not msg.media:
        return None, None, {}
        
    media_type = "document"
    metadata = {}
    
    if msg.photo:
        media_type = "photo"
    elif msg.voice:
        media_type = "voice"
        if hasattr(msg.media, "document"):
            for attr in msg.media.document.attributes:
                if isinstance(attr, DocumentAttributeAudio):
                    metadata["duration"] = attr.duration
    elif msg.video_note:
        media_type = "video_note"
        if hasattr(msg.media, "document"):
            for attr in msg.media.document.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    metadata["duration"] = attr.duration
    elif msg.video:
        media_type = "video"
        if hasattr(msg.media, "document"):
            for attr in msg.media.document.attributes:
                if isinstance(attr, DocumentAttributeVideo):
                    metadata["duration"] = attr.duration
                    metadata["w"] = attr.w
                    metadata["h"] = attr.h
    elif msg.audio:
        media_type = "audio"
        if hasattr(msg.media, "document"):
            for attr in msg.media.document.attributes:
                if isinstance(attr, DocumentAttributeAudio):
                    metadata["duration"] = attr.duration
                    metadata["title"] = attr.title or ""
                    metadata["performer"] = attr.performer or ""
    elif msg.sticker:
        media_type = "sticker"
        if hasattr(msg.media, "document"):
            for attr in msg.media.document.attributes:
                if isinstance(attr, DocumentAttributeSticker):
                    metadata["alt"] = attr.alt
    elif msg.file:
        media_type = "document"
        metadata["name"] = msg.file.name
        metadata["size"] = msg.file.size
        
    return media_type, None, metadata

def extract_buttons(msg: Message) -> list:
    """Извлекает кнопки инлайн-клавиатуры для отображения в CRM."""
    buttons = []
    if msg.buttons:
        for row in msg.buttons:
            row_btns = []
            for btn in row:
                row_btns.append({
                    "text": btn.text,
                    "data": btn.data.decode("utf-8", errors="ignore") if getattr(btn, "data", None) else None,
                    "url": getattr(btn, "url", None)
                })
            buttons.append(row_btns)
    return buttons

async def handle_new_message(account_phone: str, event: events.NewMessage.Event):
    """Обработка нового входящего или исходящего сообщения."""
    try:
        msg: Message = event.message
        chat = await event.get_chat()
        sender = await event.get_sender()
        
        chat_id = event.chat_id
        msg_id = msg.id
        is_out = bool(msg.out)
        text = msg.text or msg.raw_text or ""
        msg_date = int(msg.date.timestamp()) if msg.date else int(time.time())
        
        # Определение типа чата и заголовка
        chat_type = "user"
        title = "Диалог"
        username = ""
        
        if isinstance(chat, User):
            chat_type = "user"
            first = chat.first_name or ""
            last = chat.last_name or ""
            title = f"{first} {last}".strip() or chat.phone or f"User {chat.id}"
            username = chat.username or ""
        elif isinstance(chat, Channel):
            chat_type = "channel" if chat.broadcast else "chat"
            title = chat.title or "Канал"
            username = chat.username or ""
        elif isinstance(chat, Chat):
            chat_type = "chat"
            title = chat.title or "Группа"
            
        sender_id = sender.id if sender else (chat_id if not is_out else 0)
        sender_name = ""
        if sender:
            if isinstance(sender, User):
                sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
            elif hasattr(sender, "title"):
                sender_name = sender.title
                
        media_type, media_path, metadata = get_media_info(msg)
        buttons = extract_buttons(msg)
        
        # 1. Запись в таблицу messages
        sql_msg = """
            INSERT INTO messages 
            (account_phone, chat_id, message_id, sender_id, sender_name, text, date, is_outgoing, is_read, media_type, media_metadata, reply_to_msg_id, buttons_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_phone, chat_id, message_id) DO UPDATE SET
                text = excluded.text,
                date = excluded.date,
                is_read = CASE WHEN excluded.is_read = 1 THEN 1 ELSE messages.is_read END,
                buttons_json = excluded.buttons_json
        """
        await db.execute(sql_msg, (
            account_phone,
            chat_id,
            msg_id,
            sender_id,
            sender_name,
            text,
            msg_date,
            1 if is_out else 0,
            0,
            media_type,
            json.dumps(metadata) if metadata else None,
            msg.reply_to_msg_id,
            json.dumps(buttons) if buttons else None
        ))
        
        # 2. Обновление диалога в таблице dialogs
        # Если входящее - увеличиваем unread_count на 1
        unread_increment = 0 if is_out else 1
        
        # Человекочитаемый превью текста (никаких пустых строк или сырых [media])
        preview_text = text.strip() if text else ""
        if not preview_text:
            if media_type == "photo":
                preview_text = "📷 Фотография"
            elif media_type == "voice":
                preview_text = "🎤 Голосовое сообщение"
            elif media_type == "video_note":
                preview_text = "📹 Видеосообщение"
            elif media_type == "video":
                preview_text = "🎥 Видео"
            elif media_type == "sticker":
                preview_text = "Стикер"
            elif media_type == "audio":
                preview_text = "🎵 Аудиозапись"
            elif media_type == "document":
                preview_text = "📎 Файл"
            else:
                preview_text = "Сообщение"

        clean_phone = account_phone.strip().lstrip("+")
        existing_diag = await db.fetch_one(
            "SELECT is_archived, is_pinned, title FROM dialogs WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?",
            (clean_phone, f"+{clean_phone}", chat_id)
        )
        is_archived = existing_diag.get("is_archived", 0) if existing_diag else 0
        is_pinned = existing_diag.get("is_pinned", 0) if existing_diag else 0
        if existing_diag and existing_diag.get("title") and (not title or title.startswith("User ")):
            title = existing_diag["title"]
        
        sql_dialog = """
            INSERT INTO dialogs 
            (account_phone, chat_id, chat_type, title, username, top_message_text, top_message_date, unread_count, updated_at, is_archived, is_pinned, top_message_id, top_message_is_outgoing)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(account_phone, chat_id) DO UPDATE SET
                title = CASE WHEN excluded.title != '' THEN excluded.title ELSE dialogs.title END,
                username = CASE WHEN excluded.username != '' THEN excluded.username ELSE dialogs.username END,
                top_message_text = excluded.top_message_text,
                top_message_date = excluded.top_message_date,
                unread_count = CASE WHEN ? = 1 THEN dialogs.unread_count + 1 ELSE dialogs.unread_count END,
                top_message_id = excluded.top_message_id,
                top_message_is_outgoing = excluded.top_message_is_outgoing,
                updated_at = excluded.updated_at
        """
        now = int(time.time())
        actual_chat_type = "user" if chat_id > 0 else chat_type
        await db.execute(sql_dialog, (
            clean_phone,
            chat_id,
            actual_chat_type,
            title,
            username,
            preview_text,
            msg_date,
            unread_increment,
            now,
            is_archived,
            is_pinned,
            msg_id,
            1 if is_out else 0,
            1 if unread_increment else 0
        ))
        
        # 3. Моментальная рассылка в веб-интерфейс по WebSocket
        ws_event = {
            "type": "new_message",
            "account_phone": clean_phone,
            "chat_id": chat_id,
            "message": {
                "id": msg_id,
                "message_id": msg_id,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "text": text,
                "date": msg_date,
                "is_outgoing": is_out,
                "is_read": False,
                "media_type": media_type,
                "media_metadata": metadata,
                "buttons": buttons
            },
            "dialog": {
                "account_phone": clean_phone,
                "chat_id": chat_id,
                "title": title,
                "username": username,
                "top_message_text": preview_text,
                "top_message_date": msg_date,
                "top_message_id": msg_id,
                "top_message_is_outgoing": 1 if is_out else 0,
                "top_message_is_read": 0,
                "chat_type": actual_chat_type,
                "is_archived": is_archived,
                "is_pinned": is_pinned
            }
        }
        await broadcaster.broadcast(ws_event)
        if actual_chat_type == "user":
            logger.info(f"[{account_phone}] Новое ЛС от {title} ({chat_id}): {preview_text[:30]}")
        
        # 4. Проверка и перехват взаимных симпатий в Дайвинчике (@leomatchbot)
        if not is_out and text:
            is_leomatch = (
                (username and "leomatch" in username.lower()) or
                ("дайвинчик" in (title or "").lower()) or
                (chat_id in (1234060895, 687370304))
            )
            if is_leomatch:
                try:
                    from app.modules.leomatch.parser import handle_incoming_leomatch_message
                    await handle_incoming_leomatch_message(clean_phone, text, msg_date, msg)
                except Exception as lm_err:
                    logger.warning(f"Ошибка парсера взаимки Дайвинчика: {lm_err}")

    except Exception as e:
        logger.error(f"Ошибка в handle_new_message [{account_phone}]: {e}", exc_info=True)

async def handle_message_read(account_phone: str, event: events.MessageRead.Event):
    """Обработка прочтения сообщений в Telegram (outbox=True означает, что собеседник прочитал исходящие)."""
    try:
        clean = account_phone.strip().lstrip("+")
        chat_id = event.chat_id
        max_id = event.max_id
        is_out = bool(event.outbox)
        
        if is_out:
            sql = """
                UPDATE messages 
                SET is_read = 1
                WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id <= ?
            """
            await db.execute(sql, (clean, f"+{clean}", chat_id, max_id))
            await db.execute(
                "UPDATE dialogs SET read_outbox_max_id = MAX(read_outbox_max_id, ?) WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?",
                (max_id, clean, f"+{clean}", chat_id)
            )
            
            await broadcaster.broadcast({
                "type": "messages_read",
                "account_phone": clean,
                "chat_id": chat_id,
                "max_id": max_id
            })
        else:
            sql = """
                UPDATE dialogs
                SET unread_count = 0
                WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
            """
            await db.execute(sql, (clean, f"+{clean}", chat_id))
            
            await broadcaster.broadcast({
                "type": "dialog_read",
                "account_phone": clean,
                "chat_id": chat_id
            })
    except Exception as e:
        logger.error(f"Ошибка в handle_message_read [{account_phone}]: {e}", exc_info=True)
