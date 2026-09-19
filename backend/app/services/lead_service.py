import time
import json
from typing import List, Dict, Any, Optional
from app.db.database import db
from app.telegram.client_manager import client_manager
from telethon.tl.functions.users import GetFullUserRequest
from app.core.logger import logger
import asyncio
from app.telegram.events_dispatcher import broadcaster

async def _bg_enrich_lead_profile(clean: str, chat_id: int):
    """Фоновое обогащение карточки лида (биография, ДР, личный канал) без заморозки HTTP-ответа."""
    if chat_id <= 0:
        return
    client = client_manager.get_client(clean)
    if not client or not client.is_connected():
        return
    try:
        full = await client(GetFullUserRequest(chat_id))
        user = full.users[0] if full.users else None
        if not user:
            return

        first_name = user.first_name or ""
        last_name = user.last_name or ""
        username = user.username or ""
        bio = getattr(full.full_user, "about", "") or ""
        birthday = ""
        channel_link = ""
        channel_title = ""

        if hasattr(full.full_user, "birthday") and full.full_user.birthday:
            b = full.full_user.birthday
            birthday = f"{b.day:02d}.{b.month:02d}" + (f".{b.year}" if b.year else "")
            
        if hasattr(full.full_user, "personal_channel_id") and full.full_user.personal_channel_id:
            ch_id = full.full_user.personal_channel_id
            for ch in getattr(full, "chats", []):
                if getattr(ch, "id", None) == ch_id:
                    channel_title = getattr(ch, "title", "") or ""
                    ch_user = getattr(ch, "username", "") or ""
                    if ch_user:
                        channel_link = f"https://t.me/{ch_user}"
                    else:
                        channel_link = f"https://t.me/c/{ch_id}"
                    break
            if not channel_link:
                channel_link = f"https://t.me/c/{ch_id}"

        now = int(time.time())
        await db.execute("""
            UPDATE leads 
            SET first_name = ?, last_name = ?, username = ?, bio = ?, birthday = ?, channel_link = ?, channel_title = ?, updated_at = ?
            WHERE chat_id = ?
        """, (first_name, last_name, username, bio, birthday, channel_link, channel_title, now, chat_id))

        # Оповещаем веб-сокет об обновлении данных лида
        updated_lead = await db.fetch_one("SELECT * FROM leads WHERE chat_id = ?", (chat_id,))
        if updated_lead:
            u_dict = dict(updated_lead)
            group_ids_raw = u_dict.get("lead_group_ids") or ""
            u_dict["group_ids"] = [int(g) for g in group_ids_raw.split(",") if g.strip().isdigit()]
            await broadcaster.broadcast({
                "type": "lead_updated",
                "chat_id": chat_id,
                "lead": u_dict
            })
    except Exception as e:
        logger.debug(f"Фоновое обогащение лида {chat_id}: {e}")

async def get_lead_profile(chat_id: int, account_phone: Optional[str] = None) -> Dict[str, Any]:
    """
    Возвращает карточку лида со всей CRM-информацией моментально (< 1 мс).
    Если данных нет — запускает фоновое обогащение из Telegram.
    """
    lead = await db.fetch_one("SELECT * FROM leads WHERE chat_id = ?", (chat_id,))
    clean = (account_phone or "").strip().lstrip("+")

    if lead:
        lead_dict = dict(lead)
        group_ids_raw = lead_dict.get("lead_group_ids") or ""
        lead_dict["group_ids"] = [int(g) for g in group_ids_raw.split(",") if g.strip().isdigit()]

        # Если данных канала ещё нет, запускаем обогащение в фоне
        if (not lead_dict.get("channel_title") or not lead_dict.get("bio")) and chat_id > 0:
            asyncio.create_task(_bg_enrich_lead_profile(clean, chat_id))

        return lead_dict

    # Создаем базовую карточку лида
    now = int(time.time())
    await db.execute("""
        INSERT INTO leads (chat_id, account_phone, updated_at) VALUES (?, ?, ?)
    """, (chat_id, account_phone, now))

    if chat_id > 0:
        asyncio.create_task(_bg_enrich_lead_profile(clean, chat_id))

    return {
        "chat_id": chat_id,
        "account_phone": account_phone,
        "first_name": "",
        "last_name": "",
        "username": "",
        "bio": "",
        "birthday": "",
        "channel_link": "",
        "channel_title": "",
        "notes": "",
        "group_ids": []
    }

async def update_lead_profile(
    chat_id: int,
    notes: Optional[str] = None,
    birthday: Optional[str] = None,
    channel_link: Optional[str] = None,
    group_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """Обновляет заметки оператора, дату рождения, ссылку и теги воронки лида."""
    sets = []
    vals = []
    
    if notes is not None:
        sets.append("notes = ?")
        vals.append(notes)
    if birthday is not None:
        sets.append("birthday = ?")
        vals.append(birthday)
    if channel_link is not None:
        sets.append("channel_link = ?")
        vals.append(channel_link)
    if group_ids is not None:
        sets.append("lead_group_ids = ?")
        vals.append(",".join(map(str, group_ids)))

    sets.append("updated_at = ?")
    vals.append(int(time.time()))
    vals.append(chat_id)

    sql = f"UPDATE leads SET {', '.join(sets)} WHERE chat_id = ?"
    await db.execute(sql, tuple(vals))
    return await get_lead_profile(chat_id)

async def get_all_lead_groups() -> List[Dict[str, Any]]:
    """Возвращает список тегов воронки лидов (Собеседование, Стажировка, Клиент и т.д.)."""
    return await db.fetch_all("SELECT * FROM lead_groups ORDER BY id ASC")

async def create_lead_group(name: str, color: str = "#3b82f6") -> int:
    now = int(time.time())
    return await db.execute("INSERT INTO lead_groups (name, color, created_at) VALUES (?, ?, ?)", (name.strip(), color, now))

async def delete_lead_group(group_id: int) -> bool:
    await db.execute("DELETE FROM lead_groups WHERE id = ?", (group_id,))
    return True

# ==================== ХРАНИЛИЩЕ ВЗАИМОК ДАЙВИНЧИКА ====================

async def get_leomatch_matches(account_phone: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
    """Возвращает собранные взаимные симпатии из Дайвинчика."""
    where = []
    params = []
    if account_phone:
        where.append("(account_phone = ? OR account_phone = ?)")
        clean = account_phone.strip().lstrip("+")
        params.extend([clean, f"+{clean}"])
    if status:
        where.append("status = ?")
        params.append(status)

    where_str = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"SELECT * FROM leomatch_matches {where_str} ORDER BY created_at DESC"
    return await db.fetch_all(sql, tuple(params))

async def update_match_status(match_id: int, status: str) -> bool:
    await db.execute("UPDATE leomatch_matches SET status = ? WHERE id = ?", (status, match_id))
    return True
