import asyncio
import random
import re
import time
from typing import List, Dict, Any, Optional
from telethon.errors import FloodWaitError, UserPrivacyRestrictedError, PeerFloodError
from app.core.logger import logger
from app.db.database import db
from app.services.task_engine import task_engine
from app.telegram.client_manager import client_manager

def process_spintax(text: str) -> str:
    """
    Рекурсивный генератор спинтакса вида:
    {Привет|Здравствуйте|{Добрый день|Приветствую}}
    """
    pattern = re.compile(r'\{([^{}]+)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        choices = match.group(1).split('|')
        text = text[:match.start()] + random.choice(choices) + text[match.end():]
    return text

async def run_mass_sender(
    task_id: str,
    account_phones: List[str],
    targets: List[str],
    message_template: str,
    min_delay: float = 15.0,
    max_delay: float = 35.0,
    max_messages_per_account: int = 25
):
    """
    Массовая рассылка по списку лидов/юзернеймов с распределением по аккаунтам.
    Рандомизирует текст спинтаксом, держит безопасные задержки и обходит FloodWait.
    """
    total = len(targets)
    sent_count = 0
    errors_count = 0

    await task_engine.update_progress(task_id, processed=0, total=total, log_line=f"Старт рассылки по {total} получателям")

    # Формируем пул активных клиентов
    active_clients = []
    for ph in account_phones:
        c = client_manager.get_client(ph)
        if c and c.is_connected():
            active_clients.append((ph, c, 0))  # (phone, client, messages_sent)

    if not active_clients:
        await task_engine.update_progress(task_id, status="failed", log_line="Нет подключенных аккаунтов для рассылки")
        return

    target_idx = 0
    client_idx = 0

    while target_idx < total and not task_engine.is_cancelled(task_id):
        await task_engine.wait_if_paused(task_id)

        target = targets[target_idx].strip()
        target_idx += 1
        if not target:
            continue

        # Выбираем следующий аккаунт по кругу (Round-Robin)
        ph, client, acc_sent = active_clients[client_idx]
        client_idx = (client_idx + 1) % len(active_clients)

        # Генерируем уникальный вариант сообщения через спинтакс
        final_text = process_spintax(message_template)

        try:
            # Имитация набора текста
            async with client.action(target, 'typing'):
                await asyncio.sleep(random.uniform(2.0, 4.0))

            sent = await client.send_message(target, final_text)
            sent_count += 1
            delay = random.uniform(min_delay, max_delay)
            await task_engine.update_progress(
                task_id, processed=sent_count, total=total,
                log_line=f"[{ph}] Отправлено -> {target} (пауза {delay:.1f}с)"
            )
            await asyncio.sleep(delay)

        except FloodWaitError as fe:
            await task_engine.update_progress(task_id, log_line=f"[{ph}] FloodWait: {fe.seconds}с. Пропуск аккаунта.")
            # Убираем временно аккаунт из пула
            active_clients = [ac for ac in active_clients if ac[0] != ph]
            if not active_clients:
                await task_engine.update_progress(task_id, status="failed", log_line="Все аккаунты поймали FloodWait.")
                return
            client_idx = 0
        except (UserPrivacyRestrictedError, PeerFloodError) as pr:
            await task_engine.update_progress(task_id, log_line=f"[{ph}] Ошибка приватности/спамблок у {target}: {pr}")
            errors_count += 1
        except Exception as ex:
            await task_engine.update_progress(task_id, log_line=f"[{ph}] Ошибка отправки {target}: {ex}")
            errors_count += 1

    status = "completed" if not task_engine.is_cancelled(task_id) else "cancelled"
    await task_engine.update_progress(
        task_id, status=status,
        log_line=f"Рассылка завершена. Успешно: {sent_count}, ошибок: {errors_count}"
    )
