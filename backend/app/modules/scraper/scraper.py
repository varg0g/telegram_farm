import asyncio
import time
from typing import List, Dict, Any, Optional
from telethon.tl.types import User, UserStatusRecently, UserStatusOnline, ChannelParticipantsRecent
from telethon.tl.functions.channels import GetParticipantsRequest
from app.core.logger import logger
from app.db.database import db
from app.services.task_engine import task_engine
from app.telegram.client_manager import client_manager

async def run_chat_scraper(
    task_id: str,
    account_phone: str,
    chat_username_or_link: str,
    only_active: bool = True,
    only_with_username: bool = True,
    max_count: int = 500
):
    """
    Парсер участников из целевых групп и каналов.
    Фильтрует ботов, неактивных пользователей и сохраняет лидов в CRM.
    """
    clean = account_phone.strip().lstrip("+")
    client = client_manager.get_client(clean)
    if not client or not client.is_connected():
        await task_engine.update_progress(task_id, status="failed", log_line=f"Аккаунт {clean} не подключен")
        return

    await task_engine.update_progress(task_id, log_line=f"Поиск чата: {chat_username_or_link}")

    try:
        entity = await client.get_entity(chat_username_or_link)
        title = getattr(entity, "title", chat_username_or_link)
        await task_engine.update_progress(task_id, log_line=f"Чат '{title}' найден. Сбор участников...")
        
        offset = 0
        limit = 100
        total_scraped = 0
        saved = 0

        while total_scraped < max_count and not task_engine.is_cancelled(task_id):
            await task_engine.wait_if_paused(task_id)

            participants = await client(GetParticipantsRequest(
                channel=entity,
                filter=ChannelParticipantsRecent(),
                offset=offset,
                limit=limit,
                hash=0
            ))

            if not participants.users:
                break

            for u in participants.users:
                if total_scraped >= max_count or task_engine.is_cancelled(task_id):
                    break

                if not isinstance(u, User) or u.bot or u.deleted:
                    continue

                username = u.username or ""
                if only_with_username and not username:
                    continue

                # Фильтр по активности (только те, кто был онлайн недавно)
                if only_active:
                    status = u.status
                    if not isinstance(status, (UserStatusRecently, UserStatusOnline)):
                        continue

                first_name = u.first_name or ""
                last_name = u.last_name or ""
                phone = u.phone or ""

                # Сохраняем в таблицу leads
                now = int(time.time())
                sql = """
                    INSERT INTO leads (chat_id, first_name, last_name, username, phone, notes, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(chat_id) DO UPDATE SET
                        username = CASE WHEN excluded.username != '' THEN excluded.username ELSE leads.username END,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name
                """
                await db.execute(sql, (u.id, first_name, last_name, username, phone, f"Спарсен из {title}", now))
                saved += 1
                total_scraped += 1

            offset += len(participants.users)
            await task_engine.update_progress(
                task_id, processed=saved, total=max_count,
                log_line=f"Собрано {saved} активных участников..."
            )
            await asyncio.sleep(1.5)

        status = "completed" if not task_engine.is_cancelled(task_id) else "cancelled"
        await task_engine.update_progress(task_id, status=status, log_line=f"Парсинг завершен. Сохранено лидов: {saved}")

    except Exception as e:
        logger.error(f"Ошибка парсинга чата {chat_username_or_link}: {e}", exc_info=True)
        await task_engine.update_progress(task_id, status="failed", log_line=f"Ошибка: {e}")
