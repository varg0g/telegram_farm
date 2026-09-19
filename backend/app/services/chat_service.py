import time
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from telethon.tl.functions.messages import SendReactionRequest
from telethon.tl.types import ReactionEmoji
from app.core.config import MEDIA_DIR, UPLOADS_DIR
from app.core.logger import logger
from app.db.database import db
from app.telegram.client_manager import client_manager
from app.telegram.events_dispatcher import broadcaster

async def get_dialogs_list(
    account_phone: Optional[str] = None,
    group_id: Optional[int] = None,
    chat_type: Optional[str] = None,
    search: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Молниеносное чтение списка диалогов из локальной базы данных (< 3 мс).
    Поддерживает фильтрацию:
      - по конкретному аккаунту
      - по рабочей группе аккаунтов (общая лента группы)
      - по типу чата (user / chat / channel / bot)
      - по поисковой строке
    """
    conditions = []
    params = []

    if account_phone:
        clean = account_phone.strip().lstrip("+")
        conditions.append("(d.account_phone = ? OR d.account_phone = ?)")
        params.extend([clean, f"+{clean}"])

    if group_id is not None:
        conditions.append("a.work_group_id = ?")
        params.append(group_id)

    if chat_type == "archive":
        conditions.append("d.is_archived = 1")
    else:
        conditions.append("(d.is_archived = 0 OR d.is_archived IS NULL)")
        if chat_type and chat_type != "all":
            if chat_type == "private":
                conditions.append("d.chat_type IN ('user', 'private')")
            elif chat_type == "group":
                conditions.append("d.chat_type IN ('group', 'chat', 'megagroup')")
            elif chat_type == "channel":
                conditions.append("d.chat_type = 'channel'")
            elif chat_type == "bot":
                conditions.append("d.chat_type = 'bot'")
            else:
                conditions.append("d.chat_type = ?")
                params.append(chat_type)

    if search:
        conditions.append("(d.title LIKE ? OR d.username LIKE ? OR d.top_message_text LIKE ?)")
        term = f"%{search.strip()}%"
        params.extend([term, term, term])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    order_clause = "ORDER BY d.top_message_date DESC" if not account_phone else "ORDER BY d.is_pinned DESC, d.top_message_date DESC"

    sql = f"""
        SELECT d.*, a.first_name as account_first, a.last_name as account_last, a.username as account_username
        FROM dialogs d
        LEFT JOIN accounts a ON (d.account_phone = a.phone OR d.account_phone = a.session_name)
        {where_clause}
        {order_clause}
        LIMIT 200
    """
    rows = await db.fetch_all(sql, tuple(params))
    
    result = []
    for r in rows:
        d = dict(r)
        top_out = bool(d.get("top_message_is_outgoing", 0))
        read_max = d.get("read_outbox_max_id", 0) or 0
        top_id = d.get("top_message_id", 0) or 0
        d["top_message_is_read"] = 1 if (top_out and read_max > 0 and top_id <= read_max) else 0
        result.append(d)
    return result

import asyncio

async def _bg_sync_peer_dialog(clean: str, chat_id: int, current_read_max: int):
    """Фоновая синхронизация прочитанности из Telegram без блокировки UI."""
    client = client_manager.get_client(clean)
    if not client or not client.is_connected():
        return
    try:
        from telethon.tl.functions.messages import GetPeerDialogsRequest
        from telethon.tl.types import InputDialogPeer
        peer = await asyncio.wait_for(client.get_input_entity(chat_id), timeout=4.0)
        res = await asyncio.wait_for(client(GetPeerDialogsRequest(peers=[InputDialogPeer(peer)])), timeout=4.0)
        if res and res.dialogs:
            tg_max = getattr(res.dialogs[0], 'read_outbox_max_id', 0)
            if tg_max > current_read_max:
                await db.execute(
                    "UPDATE dialogs SET read_outbox_max_id = ? WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?",
                    (tg_max, clean, f"+{clean}", chat_id)
                )
                await db.execute(
                    "UPDATE messages SET is_read = 1 WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id <= ?",
                    (clean, f"+{clean}", chat_id, tg_max)
                )
    except Exception as e:
        logger.debug(f"Background peer dialog sync for {chat_id}: {e}")

async def get_chat_messages(
    account_phone: str,
    chat_id: int,
    limit: int = 60,
    offset_id: int = 0
) -> List[Dict[str, Any]]:
    """
    Возвращает историю сообщений чата из локальной БД (хронологический порядок) за 1-2 мс.
    Синхронизацию с Telegram и предзагрузку голосовых/кружков запускает в фоне.
    """
    clean = account_phone.strip().lstrip("+")
    
    # 1. Считываем read_outbox_max_id из dialogs
    diag_row = await db.fetch_one(
        "SELECT read_outbox_max_id FROM dialogs WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?",
        (clean, f"+{clean}", chat_id)
    )
    read_outbox_max_id = diag_row.get("read_outbox_max_id", 0) if diag_row else 0

    # 2. Фоновое уточнение прочитанности без блокировки ответа
    if offset_id == 0:
        asyncio.create_task(_bg_sync_peer_dialog(clean, chat_id, read_outbox_max_id))

    client = client_manager.get_client(clean)

    if offset_id > 0:
        sql = """
            SELECT * FROM messages
            WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND message_id < ?
            ORDER BY message_id DESC
            LIMIT ?
        """
        rows = await db.fetch_all(sql, (clean, f"+{clean}", chat_id, offset_id, limit))
    else:
        sql = """
            SELECT * FROM messages
            WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
            ORDER BY message_id DESC
            LIMIT ?
        """
        rows = await db.fetch_all(sql, (clean, f"+{clean}", chat_id, limit))

    # Если сообщений нет в локальной базе — подтягиваем из Telegram
    if not rows and offset_id == 0:
        if client and client.is_connected():
            try:
                tg_msgs = await asyncio.wait_for(client.get_messages(chat_id, limit=limit), timeout=6.0)
                batch_rows = []
                for m in tg_msgs:
                    from app.telegram.events_dispatcher import get_media_info, extract_buttons
                    m_type, m_path, meta = get_media_info(m)
                    btns = extract_buttons(m)
                    m_date = int(m.date.timestamp()) if m.date else int(time.time())
                    is_out = 1 if m.out else 0
                    is_read = 1 if (is_out and read_outbox_max_id > 0 and m.id <= read_outbox_max_id) else (1 if not is_out else 0)
                    batch_rows.append((
                        clean, chat_id, m.id, m.sender_id, m.text or "", m_date,
                        is_out, is_read, m_type,
                        json.dumps(meta) if meta else None,
                        json.dumps(btns) if btns else None
                    ))
                
                if batch_rows:
                    sql_ins = """
                        INSERT OR IGNORE INTO messages 
                        (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, media_type, media_metadata, buttons_json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    await db.executemany(sql_ins, batch_rows)

                # Перечитываем из локальной базы
                rows = await db.fetch_all(sql, (clean, f"+{clean}", chat_id, limit))
            except Exception as e:
                logger.warning(f"Ошибка загрузки истории из Telegram для {chat_id}: {e}")

    # 3. Асинхронно синхронизируем статус is_read в SQLite в фоне (не блокируя ответ клиенту)
    if read_outbox_max_id > 0:
        async def _sync_msgs_read():
            try:
                await db.execute(
                    "UPDATE messages SET is_read = 1 WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id <= ?",
                    (clean, f"+{clean}", chat_id, read_outbox_max_id)
                )
                await db.execute(
                    "UPDATE messages SET is_read = 0 WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_outgoing = 1 AND message_id > ?",
                    (clean, f"+{clean}", chat_id, read_outbox_max_id)
                )
            except Exception:
                pass
        asyncio.create_task(_sync_msgs_read())

    # Вычисляем максимальный входящий message_id для эвристики, если read_outbox_max_id неизвестен
    max_incoming_id = 0
    for r in rows:
        if not r.get("is_outgoing"):
            if r.get("message_id", 0) > max_incoming_id:
                max_incoming_id = r.get("message_id", 0)

    # Разворачиваем старые -> новые для отображения переписки
    result = []
    for r in reversed(rows):
        d = dict(r)
        d["db_id"] = d.get("id")
        d["id"] = d.get("message_id")
        if d.get("media_metadata"):
            try:
                d["media_metadata"] = json.loads(d["media_metadata"])
            except Exception:
                pass
        if d.get("buttons_json"):
            try:
                d["buttons"] = json.loads(d["buttons_json"])
            except Exception:
                d["buttons"] = []

        is_out = bool(d.get("is_outgoing"))
        msg_id = d.get("message_id", 0)
        if is_out:
            if read_outbox_max_id > 0:
                d["is_read"] = 1 if msg_id <= read_outbox_max_id else 0
            elif max_incoming_id > 0:
                d["is_read"] = 1 if msg_id < max_incoming_id else 0
        else:
            d["is_read"] = 1

        result.append(d)

    # Фоновая предзагрузка максимум 2 последних голосовых/кружочков (не перегружая канал)
    prefetch_count = 0
    for m in reversed(result):
        m_type = m.get("media_type")
        m_id = m.get("message_id")
        if m_type in ("voice", "video_note") and m_id:
            try:
                from app.api.media import find_cached_media, prefetch_media
                if not find_cached_media(clean, chat_id, m_id):
                    asyncio.create_task(prefetch_media(clean, chat_id, m_id))
                    prefetch_count += 1
                    if prefetch_count >= 2:
                        break
            except Exception:
                pass

    return result

async def send_text_message(
    account_phone: str,
    chat_id: int,
    text: str,
    reply_to_msg_id: Optional[int] = None
) -> Dict[str, Any]:
    """Отправляет текстовое сообщение через Telethon и сохраняет в БД."""
    client = client_manager.get_client(account_phone)
    if not client or not client.is_connected():
        raise RuntimeError("Аккаунт не подключен")

    sent = await client.send_message(chat_id, text, reply_to=reply_to_msg_id)
    now = int(sent.date.timestamp()) if sent.date else int(time.time())
    
    # Сохраняем локально (is_read = 0 пока не прочитано получателем)
    sql_msg = """
        INSERT INTO messages 
        (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, reply_to_msg_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
    """
    clean = account_phone.strip().lstrip("+")
    await db.execute(sql_msg, (clean, chat_id, sent.id, sent.sender_id, text, now, reply_to_msg_id))

    # Обновляем диалог
    sql_diag = """
        UPDATE dialogs 
        SET top_message_text = ?, top_message_date = ?, updated_at = ?
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
    """
    await db.execute(sql_diag, (text, now, now, clean, f"+{clean}", chat_id))

    # WebSocket рассылка
    msg_dict = {
        "id": sent.id,
        "message_id": sent.id,
        "sender_id": sent.sender_id,
        "text": text,
        "date": now,
        "is_outgoing": True,
        "is_read": False,
        "reply_to_msg_id": reply_to_msg_id
    }
    await broadcaster.broadcast({
        "type": "new_message",
        "account_phone": clean,
        "chat_id": chat_id,
        "message": msg_dict
    })
    return msg_dict

async def send_voice_message(
    account_phone: str,
    chat_id: int,
    voice_file_path: Path,
    reply_to_msg_id: Optional[int] = None
) -> Dict[str, Any]:
    """Отправляет нативное голосовое сообщение (voice note) и кэширует локально."""
    import shutil
    from app.api.media import register_cached_media
    client = client_manager.get_client(account_phone)
    if not client or not client.is_connected():
        raise RuntimeError("Аккаунт не подключен")

    sent = await client.send_file(chat_id, voice_file_path, voice_note=True, reply_to=reply_to_msg_id)
    now = int(sent.date.timestamp()) if sent.date else int(time.time())
    clean = account_phone.strip().lstrip("+")

    # Кэшируем для мгновенного воспроизведения в UI
    target_media = MEDIA_DIR / f"{clean}_{chat_id}_{sent.id}.ogg"
    try:
        shutil.copy2(voice_file_path, target_media)
        register_cached_media(target_media)
    except Exception as e:
        logger.debug(f"Could not cache sent voice: {e}")

    dur = getattr(getattr(sent, "voice", None), "duration", 0) or 0
    meta = {"duration": dur}

    await db.execute("""
        INSERT INTO messages 
        (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, media_type, media_path, media_metadata, reply_to_msg_id)
        VALUES (?, ?, ?, ?, 'Голосовое сообщение', ?, 1, 0, 'voice', ?, ?, ?)
    """, (clean, chat_id, sent.id, sent.sender_id, now, str(target_media), json.dumps(meta), reply_to_msg_id))

    await db.execute("""
        UPDATE dialogs 
        SET top_message_text = 'Голосовое сообщение', top_message_date = ?, updated_at = ?
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
    """, (now, now, clean, f"+{clean}", chat_id))

    msg_dict = {
        "id": sent.id,
        "message_id": sent.id,
        "sender_id": sent.sender_id,
        "text": "Голосовое сообщение",
        "date": now,
        "is_outgoing": True,
        "is_read": False,
        "media_type": "voice",
        "media_metadata": meta,
        "reply_to_msg_id": reply_to_msg_id
    }
    await broadcaster.broadcast({
        "type": "new_message",
        "account_phone": clean,
        "chat_id": chat_id,
        "message": msg_dict
    })
    return msg_dict

async def send_video_note_message(
    account_phone: str,
    chat_id: int,
    video_file_path: Path,
    reply_to_msg_id: Optional[int] = None
) -> Dict[str, Any]:
    """Отправляет видеосообщение в кружке (video note) и кэширует локально."""
    import shutil
    from app.api.media import register_cached_media
    client = client_manager.get_client(account_phone)
    if not client or not client.is_connected():
        raise RuntimeError("Аккаунт не подключен")

    sent = await client.send_file(chat_id, video_file_path, video_note=True, reply_to=reply_to_msg_id)
    now = int(sent.date.timestamp()) if sent.date else int(time.time())
    clean = account_phone.strip().lstrip("+")

    target_media = MEDIA_DIR / f"{clean}_{chat_id}_{sent.id}.mp4"
    try:
        shutil.copy2(video_file_path, target_media)
        register_cached_media(target_media)
    except Exception as e:
        logger.debug(f"Could not cache sent video note: {e}")

    dur = getattr(getattr(sent, "video_note", None), "duration", 0) or 0
    meta = {"duration": dur}

    await db.execute("""
        INSERT INTO messages 
        (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, media_type, media_path, media_metadata, reply_to_msg_id)
        VALUES (?, ?, ?, ?, 'Видеосообщение', ?, 1, 0, 'video_note', ?, ?, ?)
    """, (clean, chat_id, sent.id, sent.sender_id, now, str(target_media), json.dumps(meta), reply_to_msg_id))

    await db.execute("""
        UPDATE dialogs 
        SET top_message_text = 'Видеосообщение', top_message_date = ?, updated_at = ?
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
    """, (now, now, clean, f"+{clean}", chat_id))

    msg_dict = {
        "id": sent.id,
        "message_id": sent.id,
        "sender_id": sent.sender_id,
        "text": "Видеосообщение",
        "date": now,
        "is_outgoing": True,
        "is_read": False,
        "media_type": "video_note",
        "media_metadata": meta,
        "reply_to_msg_id": reply_to_msg_id
    }
    await broadcaster.broadcast({
        "type": "new_message",
        "account_phone": clean,
        "chat_id": chat_id,
        "message": msg_dict
    })
    return msg_dict

async def send_file_message(
    account_phone: str,
    chat_id: int,
    file_path: Path,
    caption: Optional[str] = None,
    reply_to_msg_id: Optional[int] = None
) -> Dict[str, Any]:
    """Отправляет файл (фото, документ, видео) через Telethon и сохраняет в БД."""
    import shutil
    from app.api.media import register_cached_media
    client = client_manager.get_client(account_phone)
    if not client or not client.is_connected():
        raise RuntimeError("Аккаунт не подключен")

    sent = await client.send_file(chat_id, file_path, caption=caption or "", reply_to=reply_to_msg_id)
    now = int(sent.date.timestamp()) if sent.date else int(time.time())
    clean = account_phone.strip().lstrip("+")

    from app.telegram.events_dispatcher import get_media_info
    m_type, m_path, meta = get_media_info(sent)

    ext = file_path.suffix or ".bin"
    target_media = MEDIA_DIR / f"{clean}_{chat_id}_{sent.id}{ext}"
    try:
        shutil.copy2(file_path, target_media)
        register_cached_media(target_media)
    except Exception as e:
        logger.debug(f"Could not cache sent file: {e}")

    text_preview = caption or f"[{m_type or 'Файл'}]"
    await db.execute("""
        INSERT INTO messages 
        (account_phone, chat_id, message_id, sender_id, text, date, is_outgoing, is_read, media_type, media_path, media_metadata, reply_to_msg_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?)
    """, (clean, chat_id, sent.id, sent.sender_id, text_preview, now, m_type, str(target_media), json.dumps(meta) if meta else None, reply_to_msg_id))

    await db.execute("""
        UPDATE dialogs 
        SET top_message_text = ?, top_message_date = ?, updated_at = ?
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
    """, (text_preview, now, now, clean, f"+{clean}", chat_id))

    msg_dict = {
        "id": sent.id,
        "message_id": sent.id,
        "sender_id": sent.sender_id,
        "text": caption or "",
        "date": now,
        "is_outgoing": True,
        "is_read": False,
        "media_type": m_type,
        "media_metadata": meta,
        "media_path": str(target_media),
        "reply_to_msg_id": reply_to_msg_id
    }
    await broadcaster.broadcast({
        "type": "new_message",
        "account_phone": clean,
        "chat_id": chat_id,
        "message": msg_dict
    })
    return msg_dict

async def mark_dialog_read(account_phone: str, chat_id: int) -> bool:
    """Сбрасывает счетчик непрочитанных в локальной базе и шлет ack в Telegram."""
    clean = account_phone.strip().lstrip("+")
    
    # 1. Сбрасываем в локальной БД моментально
    await db.execute("""
        UPDATE dialogs SET unread_count = 0 
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ?
    """, (clean, f"+{clean}", chat_id))

    await db.execute("""
        UPDATE messages SET is_read = 1 
        WHERE (account_phone = ? OR account_phone = ?) AND chat_id = ? AND is_read = 0
    """, (clean, f"+{clean}", chat_id))

    # 2. WebSocket рассылка (счетчик на фронтенде гаснет мгновенно)
    await broadcaster.broadcast({
        "type": "dialog_read",
        "account_phone": clean,
        "chat_id": chat_id
    })

    # 3. В фоне подтверждаем Telegram без задержки ответа клиенту
    client = client_manager.get_client(clean)
    if client and client.is_connected():
        async def _ack_tg():
            try:
                await client.send_read_acknowledge(chat_id)
            except Exception as e:
                logger.debug(f"Ошибка send_read_acknowledge: {e}")
        asyncio.create_task(_ack_tg())
    return True

async def click_bot_button(account_phone: str, chat_id: int, message_id: int, button_data: str) -> bool:
    """Нажимает инлайн-кнопку у сообщения бота."""
    client = client_manager.get_client(account_phone)
    if not client or not client.is_connected():
        return False
    try:
        msg = await client.get_messages(chat_id, ids=message_id)
        if msg:
            await msg.click(data=button_data.encode("utf-8") if isinstance(button_data, str) else button_data)
            return True
    except Exception as e:
        logger.error(f"Ошибка клика кнопки: {e}")
    return False

async def get_dialog_media(
    account_phone: str,
    chat_id: int,
    kind: str = "media",
    limit: int = 50
) -> List[Dict[str, Any]]:
    """Возвращает медиафайлы чата (фото/видео, файлы, ссылки, голосовые)."""
    clean = account_phone.strip().lstrip("+")
    conditions = [
        "(account_phone = ? OR account_phone = ?)",
        "chat_id = ?"
    ]
    params = [clean, f"+{clean}", chat_id]
    
    if kind == "media":
        conditions.append("media_type IN ('photo', 'video')")
    elif kind == "files":
        conditions.append("media_type = 'document'")
    elif kind == "voice":
        conditions.append("media_type IN ('voice', 'video_note', 'audio')")
    elif kind == "links":
        conditions.append("(text LIKE '%http://%' OR text LIKE '%https://%' OR text LIKE '%t.me/%')")
    
    where = " AND ".join(conditions)
    sql = f"""
        SELECT * FROM messages
        WHERE {where}
        ORDER BY date DESC
        LIMIT ?
    """
    params.append(limit)
    rows = await db.fetch_all(sql, tuple(params))

    result = []
    for r in rows:
        item = dict(r)
        item["db_id"] = item.get("id")
        item["id"] = item.get("message_id")
        if item.get("media_metadata"):
            try:
                item["media_metadata"] = json.loads(item["media_metadata"])
            except Exception:
                pass
        result.append(item)
    return result
