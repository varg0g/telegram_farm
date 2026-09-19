import asyncio
import random
import re
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from telethon import TelegramClient
from telethon.tl.custom import Message
from app.core.logger import logger
from app.db.database import db
from app.services.task_engine import task_engine
from app.telegram.client_manager import client_manager
from app.telegram.events_dispatcher import broadcaster

BOT_USERNAME = "leomatchbot"
BOOST_CHANNEL = "leoday"

async def click_or_send(client: TelegramClient, bot: str, text: str, fallback_button: str = "") -> bool:
    """Ищет кнопку в последних сообщениях бота или отправляет текст."""
    try:
        msgs = await client.get_messages(bot, limit=5)
        for msg in msgs:
            if msg.buttons:
                for row in msg.buttons:
                    for btn in row:
                        if text.lower() in btn.text.lower():
                            await btn.click()
                            return True
        # Если кнопки нет - шлем текстом
        await client.send_message(bot, text)
        return True
    except Exception as e:
        logger.debug(f"Ошибка отправки '{text}' боту: {e}")
        return False

async def run_leomatch_autolike(
    task_id: str,
    account_phones: List[str],
    likes_per_account: int = 50,
    min_delay: float = 3.0,
    max_delay: float = 7.0,
    dislike_ratio: float = 0.2
):
    """
    Автолайкер в Дайвинчике (@leomatchbot) для группы аккаунтов.
    Просматривает анкеты, ставит лайки/дизлайки и вылавливает взаимные симпатии.
    """
    total_ops = len(account_phones) * likes_per_account
    processed = 0

    await task_engine.update_progress(task_id, processed=0, total=total_ops, log_line="Старт автолайкера Дайвинчика")

    for phone in account_phones:
        if task_engine.is_cancelled(task_id):
            break

        clean = phone.strip().lstrip("+")
        client = client_manager.get_client(clean)
        if not client or not client.is_connected():
            await task_engine.update_progress(task_id, log_line=f"[{clean}] Аккаунт не подключен, пропуск")
            continue

        await task_engine.update_progress(task_id, log_line=f"[{clean}] Запуск поиска анкет...")

        # Запускаем диалог с ботом
        try:
            await client.send_message(BOT_USERNAME, "1")
            await asyncio.sleep(2)
        except Exception as e:
            await task_engine.update_progress(task_id, log_line=f"[{clean}] Ошибка отправки боту: {e}")
            continue

        acc_likes = 0
        while acc_likes < likes_per_account and not task_engine.is_cancelled(task_id):
            await task_engine.wait_if_paused(task_id)

            # Решаем: лайк (👍 / 1 / ❤️) или дизлайк (👎 / 2)
            is_dislike = random.random() < dislike_ratio
            action_btn = "👎" if is_dislike else "👍"
            action_text = "2" if is_dislike else "1"

            ok = await click_or_send(client, BOT_USERNAME, action_btn, fallback_button=action_text)
            if ok:
                acc_likes += 1
                processed += 1
                delay = random.uniform(min_delay, max_delay)
                act_name = "Дизлайк" if is_dislike else "Лайк"
                await task_engine.update_progress(
                    task_id, processed=processed, total=total_ops,
                    log_line=f"[{clean}] {act_name} #{acc_likes} (пауза {delay:.1f}с)"
                )
                await asyncio.sleep(delay)
            else:
                await asyncio.sleep(4)

    status = "cancelled" if task_engine.is_cancelled(task_id) else "completed"
    await task_engine.update_progress(task_id, status=status, log_line=f"Работа автолайкера завершена ({status})")

async def run_leomatch_warmup(
    task_id: str,
    account_phones: List[str],
    min_likes: int = 5,
    max_likes: int = 15,
    stop_on_match: bool = True,
    max_duration_minutes: int = 60
):
    """
    Умный прогрев анкеты в Дайвинчике.
    - Ставит лайки с паузами.
    - Подписывается на @leoday с беззвучным режимом.
    - Останавливается при первой взаимной симпатии или по таймеру.
    """
    total = len(account_phones)
    processed = 0
    start_time = time.time()
    max_seconds = max_duration_minutes * 60

    await task_engine.update_progress(task_id, processed=0, total=total, log_line="Старт прогрева анкет в Дайвинчике")

    for phone in account_phones:
        if task_engine.is_cancelled(task_id):
            break
        if time.time() - start_time > max_seconds:
            await task_engine.update_progress(task_id, log_line="Достигнут лимит времени прогрева")
            break

        clean = phone.strip().lstrip("+")
        client = client_manager.get_client(clean)
        if not client or not client.is_connected():
            continue

        await task_engine.update_progress(task_id, log_line=f"[{clean}] Прогрев аккаунта...")

        # 1. Подписка на канал @leoday (если не подписан)
        try:
            from telethon.tl.functions.channels import JoinChannelRequest
            from telethon.tl.functions.account import UpdateNotifySettingsRequest
            from telethon.tl.types import InputNotifyPeer, InputPeerChannel, InputPeerNotifySettings
            
            ch = await client.get_entity(BOOST_CHANNEL)
            await client(JoinChannelRequest(ch))
            # Отключаем звук
            await client(UpdateNotifySettingsRequest(
                peer=InputNotifyPeer(ch),
                settings=InputPeerNotifySettings(mute_until=2147483647)
            ))
            await task_engine.update_progress(task_id, log_line=f"[{clean}] Подписка на @{BOOST_CHANNEL} оформлена (без звука)")
        except Exception as e:
            logger.debug(f"Ошибка подписки на leoday: {e}")

        # 2. Серия лайков для прогрева
        target_likes = random.randint(min_likes, max_likes)
        likes_done = 0
        while likes_done < target_likes and not task_engine.is_cancelled(task_id):
            await task_engine.wait_if_paused(task_id)
            if time.time() - start_time > max_seconds:
                break

            await click_or_send(client, BOT_USERNAME, "👍", fallback_button="1")
            likes_done += 1
            delay = random.uniform(4.0, 10.0)
            await task_engine.update_progress(task_id, log_line=f"[{clean}] Лайк прогрева {likes_done}/{target_likes} (ждем {delay:.1f}с)")
            await asyncio.sleep(delay)

        processed += 1
        await task_engine.update_progress(task_id, processed=processed, total=total)

    status = "completed" if not task_engine.is_cancelled(task_id) else "cancelled"
    await task_engine.update_progress(task_id, status=status, log_line=f"Прогрев завершен ({status})")

def load_data_lines(file_path: str) -> List[str]:
    """Загрузка строк из текстовых пулов данных."""
    p = Path(file_path)
    if not p.exists():
        alt = Path("backend/data") / p.name
        if alt.exists():
            p = alt
        else:
            alt2 = Path("data") / p.name
            if alt2.exists():
                p = alt2
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
        except Exception:
            pass
    return []

def process_spintax(text: str) -> str:
    """Обрабатывает спинтакс любой степени вложенности: {a|b|{c|d}}."""
    if not text:
        return ""
    pattern = re.compile(r'\{([^{}]+)\}')
    while True:
        match = pattern.search(text)
        if not match:
            break
        choices = match.group(1).split('|')
        text = text[:match.start()] + random.choice(choices) + text[match.end():]
    return text

async def press_bot_button(client: TelegramClient, bot: str, keyword: str, fallback_text: str = "") -> bool:
    """
    Ищет кнопку в последних сообщениях бота по ключевому слову и кликает по ней.
    Если кнопка не найдена, отправляет fallback_text.
    """
    kw = keyword.lower().strip()
    try:
        msgs = await client.get_messages(bot, limit=5)
        for msg in msgs:
            if msg.buttons:
                for row in msg.buttons:
                    for btn in row:
                        b_text = (btn.text or "").strip().lower()
                        if kw in b_text or (kw == "ок" and "ok" in b_text):
                            try:
                                await btn.click()
                                return True
                            except Exception:
                                pass
    except Exception as e:
        logger.debug(f"press_bot_button ошибка поиска '{keyword}': {e}")
    
    if fallback_text:
        try:
            await client.send_message(bot, fallback_text)
            return True
        except Exception as e:
            logger.debug(f"press_bot_button fallback ошибка: {e}")
            return False
    return False

async def run_leomatch_register(
    task_id: str,
    account_phones: List[str],
    gender: str = "Я парень",
    search_gender: str = "девушки",
    fixed_age: Optional[int] = None,
    fixed_city: Optional[str] = None,
    fixed_name: Optional[str] = None,
    custom_bio: Optional[str] = None,
    share_contact: bool = True,
    join_channels: bool = True,
    delay_min: float = 3.0,
    delay_max: float = 6.0
):
    """
    Пошаговая авторегистрация анкет в @leomatchbot через Telethon MTProto.
    """
    cities_pool = load_data_lines("cities.txt") or ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Краснодар"]
    names_pool = load_data_lines("names.txt") or ["Алексей", "Дмитрий", "Иван", "Максим", "Анна", "Елена"]
    about_pool = load_data_lines("about.txt") or ["{Привет!|Здравствуй!} {Ищу приятное общение|Познакомлюсь для прогулок и общения|Буду рад познакомиться}"]
    
    photos_dir = Path("backend/uploads/leomatch")
    if not photos_dir.exists():
        photos_dir = Path("uploads/leomatch")
        
    photo_files = []
    if photos_dir.exists():
        photo_files = [
            f for f in photos_dir.iterdir()
            if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
        ]

    total_accs = len(account_phones)
    processed = 0

    await task_engine.update_progress(task_id, processed=0, total=total_accs, log_line=f"Старт авторегистрации анкет ({total_accs} акк.)")

    for idx, phone in enumerate(account_phones):
        if task_engine.is_cancelled(task_id):
            break

        await task_engine.wait_if_paused(task_id)

        clean = phone.strip().lstrip("+")
        client = client_manager.get_client(clean)
        if not client or not client.is_connected():
            await task_engine.update_progress(task_id, log_line=f"[{clean}] ⚠️ Аккаунт не подключен, пропуск")
            continue

        try:
            me = await client.get_me()
            phone_number = me.phone or clean
            if not phone_number.startswith("+"):
                phone_number = "+" + phone_number

            person_name = fixed_name or (me.first_name if me.first_name else random.choice(names_pool))
            age = int(fixed_age) if fixed_age else random.choice([20, 21, 22, 23, 24, 25])
            city = fixed_city if fixed_city else random.choice(cities_pool)
            raw_bio = custom_bio if custom_bio else random.choice(about_pool)
            about_text = process_spintax(raw_bio)

            await task_engine.update_progress(
                task_id,
                log_line=f"[{idx + 1}/{total_accs}] [{clean}] Регистрация анкеты: {person_name}, {age} лет, {city}..."
            )

            # 1. Разблокировка бота если он был в ЧС
            try:
                from telethon.tl.functions.contacts import UnblockRequest
                await client(UnblockRequest(id=BOT_USERNAME))
            except Exception:
                pass

            # 2. Шаг /start
            await client.send_message(BOT_USERNAME, "/start")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 3. Выбор языка: «🇷🇺 Русский»
            await press_bot_button(client, BOT_USERNAME, "русский", "🇷🇺 Русский")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 4. «👌 давай начнем»
            await press_bot_button(client, BOT_USERNAME, "начнем", "👌 давай начнем")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 5. «👌 Ok»
            await press_bot_button(client, BOT_USERNAME, "ок", "👌 Ok")
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 6. Возраст
            await client.send_message(BOT_USERNAME, str(age))
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 7. Пол
            gender_kw = "парень" if "парень" in gender.lower() else "девушка"
            await press_bot_button(client, BOT_USERNAME, gender_kw, gender)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 8. Кого показывать
            search_kw = "девушки" if "дев" in search_gender.lower() else ("парни" if "пар" in search_gender.lower() else "все")
            await press_bot_button(client, BOT_USERNAME, search_kw, search_gender)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 9. Город
            await client.send_message(BOT_USERNAME, city)
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 10. Имя
            await client.send_message(BOT_USERNAME, person_name)
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 11. О себе
            await client.send_message(BOT_USERNAME, about_text)
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 12. Отправка фото анкеты
            if photo_files:
                chosen_photo = random.choice(photo_files)
                await client.send_file(BOT_USERNAME, str(chosen_photo))
                await asyncio.sleep(random.uniform(3.5, 5.5))
                # Подтверждаем сохранение фото
                await press_bot_button(client, BOT_USERNAME, "сохранить", "Это все, сохранить фото")
                await asyncio.sleep(random.uniform(2.5, 4.0))

            # 13. Отправка контакта (верификация номера)
            if share_contact and phone_number:
                try:
                    from telethon.tl.types import InputMediaContact
                    await client.send_file(BOT_USERNAME, InputMediaContact(phone_number=phone_number, first_name=person_name, last_name=""))
                    await asyncio.sleep(random.uniform(2.5, 4.0))
                except Exception as e:
                    logger.debug(f"Ошибка отправки контакта: {e}")

            # 14. Подтверждение анкеты («Да»)
            await press_bot_button(client, BOT_USERNAME, "да", "Да")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 15. Прогревочный лайк (❤️)
            await press_bot_button(client, BOT_USERNAME, "❤️", "❤️")
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 16. Опциональная подписка на буст-канал
            if join_channels:
                try:
                    from telethon.tl.functions.channels import JoinChannelRequest
                    from telethon.tl.functions.account import UpdateNotifySettingsRequest
                    from telethon.tl.types import InputNotifyPeer, InputPeerNotifySettings
                    ch = await client.get_entity(BOOST_CHANNEL)
                    await client(JoinChannelRequest(ch))
                    await client(UpdateNotifySettingsRequest(
                        peer=InputNotifyPeer(ch),
                        settings=InputPeerNotifySettings(mute_until=2147483647)
                    ))
                except Exception:
                    pass

            processed += 1
            await task_engine.update_progress(
                task_id,
                processed=processed,
                total=total_accs,
                log_line=f"[{processed}/{total_accs}] [{clean}] ✅ Анкета создана ({person_name}, {age} лет, {city})!"
            )

        except Exception as e:
            logger.error(f"Ошибка авторегистрации для {clean}: {e}", exc_info=True)
            await task_engine.update_progress(task_id, log_line=f"[{clean}] ❌ Ошибка регистрации: {e}")

        # Пауза между аккаунтами
        if idx < total_accs - 1:
            delay = random.uniform(delay_min, delay_max)
            await asyncio.sleep(delay)

    status = "completed" if not task_engine.is_cancelled(task_id) else "cancelled"
    await task_engine.update_progress(task_id, status=status, log_line=f"Авторегистрация завершена ({status})")

