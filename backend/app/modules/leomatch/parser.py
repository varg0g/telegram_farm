import re
import time
from typing import Dict, Any, Optional
from telethon.tl.custom import Message
from app.core.logger import logger

def is_mutual_match_message(text: str) -> bool:
    """Проверяет, является ли сообщение подтверждением взаимной симпатии (матча)."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "взаимная симпатия",
        "надеюсь хорошо проведете время",
        "надеюсь, хорошо проведете время",
        "начинай общаться",
        "есть взаимная симпатия",
        "приятного общения",
        "взаимка"
    ])

def extract_lead_from_message(text: str, msg: Optional[Message] = None) -> Dict[str, Any]:
    """
    Извлекает юзернейм, ID, имя, возраст, город и био из сообщения Дайвинчика.
    Использует как regex, так и entities Telethon (MessageEntityMentionName, MessageEntityTextUrl).
    """
    lead: Dict[str, Any] = {
        "user_id": None,
        "username": "",
        "name": "",
        "age": 0,
        "city": "",
        "bio": ""
    }
    if not text:
        return lead

    # 1. Поиск @username или t.me/username в тексте
    u_match = re.search(r'@([a-zA-Z0-9_]{4,32})', text)
    if u_match:
        lead["username"] = u_match.group(1)
    else:
        tme_match = re.search(r't\.me/([a-zA-Z0-9_]{4,32})', text)
        if tme_match:
            lead["username"] = tme_match.group(1)

    # 2. Поиск tg://user?id=12345678 в тексте
    tg_match = re.search(r'tg://user\?id=(\d+)', text)
    if tg_match:
        try:
            lead["user_id"] = int(tg_match.group(1))
        except Exception:
            pass

    # 3. Сущности Telethon msg.entities
    if msg and getattr(msg, "entities", None):
        for ent in msg.entities:
            # MessageEntityMentionName: кастомный кликабельный юзер с user_id
            if hasattr(ent, "user_id") and ent.user_id:
                lead["user_id"] = ent.user_id
            # MessageEntityTextUrl: ссылка в тексте
            if hasattr(ent, "url") and ent.url:
                url = ent.url
                if url.startswith("tg://user?id="):
                    try:
                        lead["user_id"] = int(url.split("id=")[1])
                    except Exception:
                        pass
                elif "t.me/" in url:
                    part = url.split("t.me/")[-1].split("/")[0].split("?")[0]
                    if part and not part.startswith("+") and not lead["username"]:
                        lead["username"] = part
            # MessageEntityMention: @username
            if hasattr(ent, "offset") and hasattr(ent, "length") and type(ent).__name__ == "MessageEntityMention":
                try:
                    cand = text[ent.offset:ent.offset + ent.length].lstrip("@")
                    if cand and not lead["username"]:
                        lead["username"] = cand
                except Exception:
                    pass

    # 4. Поиск имени, возраста, города и био по строкам
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    bio_lines = []

    for line in lines:
        lower_l = line.lower()
        if any(w in lower_l for w in ["симпатия", "понравил", "надеюсь", "начать", "общаться", "проведете время", "начинай"]):
            continue

        # Строка формата: "Имя, 21, Москва" или "Имя, 21"
        card_match = re.match(r'^([A-Za-zА-Яа-яЁё\s]+),\s*(\d{1,2})(?:,\s*([A-Za-zА-Яа-яЁё\s\-]+))?', line)
        if card_match and not lead["name"]:
            lead["name"] = card_match.group(1).strip()
            try:
                lead["age"] = int(card_match.group(2))
            except Exception:
                pass
            if card_match.group(3):
                lead["city"] = card_match.group(3).strip()
            continue

        # Если строка разделена запятыми: "Имя, 21, Москва"
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 2 and not lead["name"] and not line.startswith("@") and not line.startswith("http"):
            lead["name"] = parts[0]
            if len(parts) >= 2 and parts[1].isdigit():
                lead["age"] = int(parts[1])
            if len(parts) >= 3:
                lead["city"] = parts[2]
            continue

        # Описание анкеты (био)
        if not line.startswith("@") and not line.startswith("http") and not line.startswith("tg://"):
            bio_lines.append(line)

    if bio_lines:
        lead["bio"] = "\n".join(bio_lines[:3])

    if not lead["name"]:
        lead["name"] = lead["username"] or (f"User {lead['user_id']}" if lead["user_id"] else "Собеседник")

    return lead

async def handle_incoming_leomatch_message(account_phone: str, text: str, msg_date: int, msg: Optional[Message] = None) -> Optional[int]:
    """Проверяет сообщение бота Дайвинчика и сохраняет взаимку при совпадении."""
    if not is_mutual_match_message(text):
        return None

    lead = extract_lead_from_message(text, msg)
    clean = account_phone.strip().lstrip("+")
    logger.info(f"[{clean}] 💌 Обнаружена взаимная симпатия в Дайвинчике! Имя: {lead.get('name')}, @{lead.get('username')}, ID: {lead.get('user_id')}")

    try:
        from app.db.database import db
        from app.telegram.events_dispatcher import broadcaster

        # Проверяем, есть ли уже такая взаимка
        existing = None
        if lead.get("username"):
            existing = await db.fetch_one(
                "SELECT id FROM leomatch_matches WHERE (account_phone = ? OR account_phone = ?) AND lead_username = ?",
                (clean, f"+{clean}", lead["username"])
            )
        elif lead.get("user_id"):
            existing = await db.fetch_one(
                "SELECT id FROM leomatch_matches WHERE (account_phone = ? OR account_phone = ?) AND lead_user_id = ?",
                (clean, f"+{clean}", lead["user_id"])
            )

        if existing:
            await db.execute(
                "UPDATE leomatch_matches SET raw_message = ?, created_at = ? WHERE id = ?",
                (text, msg_date, existing["id"])
            )
            match_id = existing["id"]
        else:
            sql = """
                INSERT INTO leomatch_matches 
                (account_phone, lead_user_id, lead_username, lead_name, lead_age, lead_city, lead_bio, raw_message, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            match_id = await db.execute(sql, (
                clean,
                lead.get("user_id"),
                lead.get("username") or "",
                lead.get("name") or "Собеседник",
                lead.get("age") or 0,
                lead.get("city") or "",
                lead.get("bio") or "",
                text,
                "new",
                msg_date
            ))

        # Оповещаем веб-клиентов по WebSocket
        ws_event = {
            "type": "leomatch_match",
            "match": {
                "id": match_id,
                "account_phone": clean,
                "lead_user_id": lead.get("user_id"),
                "lead_username": lead.get("username") or "",
                "lead_name": lead.get("name") or "Собеседник",
                "lead_age": lead.get("age") or 0,
                "lead_city": lead.get("city") or "",
                "lead_bio": lead.get("bio") or "",
                "raw_message": text[:300],
                "status": "new",
                "created_at": msg_date
            }
        }
        await broadcaster.broadcast(ws_event)
        return match_id

    except Exception as e:
        logger.error(f"Ошибка сохранения взаимной симпатии для {clean}: {e}", exc_info=True)
        return None
