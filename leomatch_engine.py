import asyncio
import json
import os
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import aiosqlite

try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

from pyrogram import Client
from pyrogram.raw import types as raw_types

from logger import logger
from utils import _get_client, manager
from farm_tools_router import process_spintax, update_task, task_stop_flags, running_tasks
from task_manager import task_manager
from database import get_db

BOT_USERNAME = "leomatchbot"
BOOST_CHANNEL = "leoday"

ENVELOPE_EMOJIS = ["✉️", "📩", "📨", "💌", "📧", "📫", "📬", "📭", "📪", "📮", "🖂", "🖃", "💼"]

def load_data_lines(file_path: str) -> List[str]:
    p = Path(file_path)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        return [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]

async def push_bot_button(client: Client, bot_username: str, keyword: str, fallback_text: str = "") -> Tuple[bool, str]:
    """
    Ищет кнопку в последних сообщениях бота по ключевому слову (регистронезависимо).
    Поддерживает как InlineKeyboardMarkup (нажатие через msg.click / callback),
    так и ReplyKeyboardMarkup (отправка текста кнопки).
    """
    kw = keyword.lower()
    try:
        async for msg in client.get_chat_history(bot_username, limit=10):
            if not msg:
                continue

            # 1. InlineKeyboardMarkup
            if msg.reply_markup and hasattr(msg.reply_markup, "inline_keyboard"):
                for row in msg.reply_markup.inline_keyboard:
                    for btn in row:
                        b_text = (btn.text or "").strip().lower()
                        if kw in b_text or (kw == "ок" and "ok" in b_text):
                            try:
                                await msg.click(btn.text)
                                return True, f"Inline '{btn.text}' нажата"
                            except Exception:
                                if getattr(btn, "callback_data", None):
                                    await client.request_callback_answer(bot_username, msg.id, callback_data=btn.callback_data)
                                    return True, f"Callback '{btn.text}' отправлен"

            # 2. ReplyKeyboardMarkup
            if msg.reply_markup and hasattr(msg.reply_markup, "keyboard"):
                for row in msg.reply_markup.keyboard:
                    for btn in row:
                        b_text = (btn.text or "").strip().lower()
                        if kw in b_text or (kw == "ок" and "ok" in b_text):
                            await client.send_message(bot_username, btn.text)
                            return True, f"Reply '{btn.text}' отправлена"
    except Exception as e:
        logger.debug(f"Ошибка поиска кнопки '{keyword}': {e}")

    if fallback_text:
        try:
            await client.send_message(bot_username, fallback_text)
            return True, f"Отправлен fallback '{fallback_text}'"
        except Exception as e:
            return False, f"Ошибка отправки fallback: {e}"

    return False, f"Кнопка '{keyword}' не найдена"


def get_message_buttons(msg: Optional[Any]) -> List[str]:
    """
    Возвращает список текстов всех кнопок у сообщения:
    как inline_keyboard (InlineKeyboardMarkup), так и keyboard (ReplyKeyboardMarkup).
    """
    buttons: List[str] = []
    if not msg:
        return buttons

    markup = getattr(msg, "reply_markup", None)
    if not markup:
        return buttons

    # 1. InlineKeyboardMarkup
    if hasattr(markup, "inline_keyboard") and markup.inline_keyboard:
        for row in markup.inline_keyboard:
            for btn in row:
                t = getattr(btn, "text", "")
                if t:
                    buttons.append(t.strip())

    # 2. ReplyKeyboardMarkup
    if hasattr(markup, "keyboard") and markup.keyboard:
        for row in markup.keyboard:
            for btn in row:
                if hasattr(btn, "text"):
                    t = btn.text
                elif isinstance(btn, str):
                    t = btn
                else:
                    t = str(btn) if btn else ""
                if t:
                    buttons.append(t.strip())

    return buttons


# ------------------------------------------------------------------------------
# КЛАССИФИКАТОРЫ СООБЩЕНИЙ ДАЙВИНЧИКА (@leomatchbot)
# ------------------------------------------------------------------------------

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

def is_incoming_like_message(text: str) -> bool:
    """Проверяет, пришло ли уведомление о входящем лайке (поклоннике/поклоннице)."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "ты понравил",
        "кому-то понравилась",
        "кому-то понравились",
        "показать её",
        "показать его",
        "показать их",
        "1. показать"
    ])

def is_daily_limit_message(text: str) -> bool:
    """Проверяет, достигнут ли суточный лимит лайков бота."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "слишком много",
        "приходи завтра",
        "лимит лайков",
        "слишком много ❤️"
    ])

def is_verification_message(text: str) -> bool:
    """Проверяет, запросил ли бот верификацию человека."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "для верификации",
        "отправьте видео",
        "подтвердите, что вы человек",
        "видеоселфи",
        "видео-селфи"
    ])

def is_boost_channel_message(text: str) -> bool:
    """Проверяет требование подписки на партнерский буст-канал."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "буст повышается",
        "буст твоей анкеты понижен",
        "подпишись на канал"
    ])

def is_menu_message(text: str) -> bool:
    """Проверяет, находится ли бот в главном меню или меню просмотра анкет."""
    if not text:
        return False
    lower = text.lower()
    return any(p in lower for p in [
        "1. смотреть анкеты",
        "смотреть анкеты",
        "1. смотреть анкеты."
    ])


def extract_lead_from_text(text: str, msg_obj: Optional[Any] = None) -> Dict[str, Any]:
    """
    Извлекает юзернейм, имя, возраст и город из сообщения Дайвинчика.
    Поддерживает @username, t.me/username, tg://user?id=, а также entities text_mention.
    """
    lead: Dict[str, Any] = {
        "username": None,
        "name": None,
        "info": None,
        "user_id": None
    }
    if not text:
        return lead

    # 1. Поиск @username
    u_match = re.search(r'@([a-zA-Z0-9_]{4,32})', text)
    if u_match:
        lead["username"] = u_match.group(1)
    else:
        # Поиск ссылки t.me/username
        tme_match = re.search(r't\.me/([a-zA-Z0-9_]{4,32})', text)
        if tme_match:
            lead["username"] = tme_match.group(1)

    # 2. Проверка entities (TextMention / Mention)
    if msg_obj and getattr(msg_obj, "entities", None):
        for ent in msg_obj.entities:
            ent_type = str(getattr(ent, "type", ""))
            if "TEXT_MENTION" in ent_type and getattr(ent, "user", None):
                lead["user_id"] = ent.user.id
                if not lead["name"]:
                    u_full = (ent.user.first_name or "") + (" " + ent.user.last_name if ent.user.last_name else "")
                    lead["name"] = u_full.strip() or "Собеседник"
                if not lead["username"] and getattr(ent.user, "username", None):
                    lead["username"] = ent.user.username
            elif "MENTION" in ent_type:
                try:
                    mention_text = text[ent.offset:ent.offset + ent.length].lstrip("@")
                    if mention_text and not lead["username"]:
                        lead["username"] = mention_text
                except Exception:
                    pass

    # 3. Поиск первой строки с описанием человека (Имя, Возраст, Город)
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    for line in lines:
        lower_l = line.lower()
        if any(w in lower_l for w in ["симпатия", "понравил", "надеюсь", "начать", "общаться", "проведете время", "начинай"]):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 2:
            if not lead["name"]:
                lead["name"] = parts[0]
            lead["info"] = line
            break
        elif not lead["name"] and len(line) < 50 and not line.startswith("@") and not line.startswith("http"):
            lead["name"] = parts[0][:30]
            lead["info"] = line[:80]

    return lead


async def save_match(account_name: str, msg_text: str, msg_id: Optional[int] = None, msg_obj: Optional[Any] = None) -> Optional[int]:
    """
    Сохраняет найденную взаимную симпатию в базу данных и рассылает WebSocket-событие.
    """
    lead = extract_lead_from_text(msg_text, msg_obj)
    now_ts = int(time.time())

    try:
        async with get_db() as db:
            cursor = await db.execute("""
                INSERT INTO leomatch_matches 
                (account_name, lead_user_id, lead_username, lead_name, lead_info, message_text, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                account_name,
                lead.get("user_id"),
                lead.get("username"),
                lead.get("name") or "Новая симпатия",
                lead.get("info") or "",
                msg_text,
                now_ts
            ))
            await db.commit()
            match_id = cursor.lastrowid

            # Оповещаем фронтенд в реальном времени
            await manager.broadcast({
                "type": "leomatch_match",
                "match": {
                    "id": match_id,
                    "account_name": account_name,
                    "lead_username": lead.get("username"),
                    "lead_name": lead.get("name") or "Новая симпатия",
                    "lead_info": lead.get("info") or "",
                    "message_text": msg_text[:300],
                    "created_at": now_ts
                }
            })
            return match_id
    except Exception as e:
        logger.error(f"Ошибка сохранения взаимной симпатии для {account_name}: {e}")
        return None


def task_scope_wrap(task_type: str):
    def decorator(fn):
        async def wrapper(task_id: str, account_names: List[str], *args, **kwargs):
            async with task_manager.task_scope(task_id, account_names, task_type):
                return await fn(task_id, account_names, *args, **kwargs)
        return wrapper
    return decorator

# ==============================================================================
# 1. АВТОЛАЙКЕР И АВТОРАССЫЛКА СООБЩЕНИЙ (TRAFFIC MACHINE)
# ==============================================================================

@task_scope_wrap("leomatch_autolike")
async def run_leomatch_autolike(task_id: str, account_names: List[str], config: Dict[str, Any]):
    """
    Основной цикл умного автолайкера в Дайвинчике.
    """
    custom_messages = config.get("messages_custom")
    messages_pool = custom_messages if custom_messages else load_data_lines("data/messages.txt")
    if not messages_pool:
        messages_pool = ["{Привет|Здравствуй}! {Как дела|Чем занимаешься}?", "{Привет|Приветствую}! {Познакомимся|Пообщаемся}?"]

    synonyms_pool = load_data_lines("data/synonyms.txt")
    
    envelope_chance = int(config.get("envelope_chance", 70))      # % отправки письма
    min_env_delay = int(config.get("envelope_delay_min", 25))      # Мин. задержка перед отправкой письма (сек)
    max_env_delay = int(config.get("envelope_delay_max", 45))      # Макс. задержка перед отправкой письма (сек)
    max_limit_per_acc = int(config.get("max_limit_per_acc", 50))  # Лимит анкет на аккаунт (0 = безлимит до блока)
    forward_to_saved = bool(config.get("forward_to_saved", True))  # Пересылать взаимки в Избранное

    total_accs = len(account_names)
    total_messages_sent = 0
    total_matches_found = 0

    await update_task(
        task_id,
        status="running",
        total=total_accs,
        processed=0,
        progress=0,
        log=f"Запуск автолайкера на {total_accs} аккаунтах (шанс письма {envelope_chance}%)..."
    )

    for acc_idx, acc_name in enumerate(account_names):
        if task_id in task_stop_flags:
            await update_task(task_id, status="stopped", log="Остановлено пользователем")
            return

        client = await _get_client(acc_name)
        if not client:
            await update_task(task_id, log=f"[{acc_name}] ⚠️ Аккаунт не подключен, пропускаем")
            continue

        await update_task(
            task_id,
            log=f"[{acc_idx + 1}/{total_accs}] Подключение {acc_name} к @{BOT_USERNAME}..."
        )

        try:
            # 1. Разблокируем бота если был заблокирован
            try:
                await client.unblock_user(BOT_USERNAME)
            except Exception:
                pass

            # 2. Инициализация диалога
            await client.send_message(BOT_USERNAME, "1")
            await asyncio.sleep(2.5)

            # Проверяем последнее сообщение
            acc_iterations = 0
            acc_likes = 0
            acc_messages = 0
            no_button_streak = 0
            monitoring_mode = False

            while not monitoring_mode and (max_limit_per_acc == 0 or acc_iterations < max_limit_per_acc):
                if task_id in task_stop_flags:
                    await update_task(task_id, status="stopped", log="Остановлено пользователем")
                    return

                acc_iterations += 1

                # Получаем последнее сообщение от бота
                last_msg = None
                async for m in client.get_chat_history(BOT_USERNAME, limit=1):
                    last_msg = m
                    break

                if not last_msg:
                    await client.send_message(BOT_USERNAME, "1")
                    await asyncio.sleep(2)
                    continue

                raw_text = last_msg.text or getattr(last_msg, "caption", "") or ""

                # --- Проверка 1: Суточный лимит лайков бота ---
                if is_daily_limit_message(raw_text):
                    monitoring_mode = True
                    log_msg = f"[{acc_name}] 🛑 Достигнут суточный лимит лайков. Переведен в мониторинг."
                    logger.info(log_msg)
                    await update_task(task_id, log=log_msg)
                    break

                # --- Проверка 2: Взаимная симпатия! ---
                if is_mutual_match_message(raw_text):
                    total_matches_found += 1
                    log_msg = f"[{acc_name}] 🎉 ПОЙМАНА ВЗАИМНАЯ СИМПАТИЯ! Сохраняем лид..."
                    logger.info(log_msg)
                    await update_task(task_id, log=log_msg)
                    
                    await save_match(acc_name, raw_text, last_msg.id, last_msg)
                    if forward_to_saved:
                        try:
                            await client.forward_messages("me", BOT_USERNAME, [last_msg.id])
                        except Exception:
                            pass

                # --- Проверка 3: Входящий лайк («Ты понравился 1 девушке...» / «Кому-то понравилась твоя анкета») ---
                if is_incoming_like_message(raw_text):
                    logger.info(f"[{acc_name}] Обнаружен входящий лайк. Отправляем 1 для просмотра...")
                    pushed, _ = await push_bot_button(client, BOT_USERNAME, "показать", "1")
                    if not pushed:
                        await client.send_message(BOT_USERNAME, "1")
                    await asyncio.sleep(2.5)
                    continue

                # --- Проверка 4: Требование подписки на буст-канал ---
                if is_boost_channel_message(raw_text):
                    try:
                        await client.join_chat(BOOST_CHANNEL)
                        logger.info(f"[{acc_name}] Подписались на спонсорский канал @{BOOST_CHANNEL}")
                    except Exception as e:
                        logger.warning(f"[{acc_name}] Не удалось подписаться на {BOOST_CHANNEL}: {e}")

                # --- Проверка 5: Запрос верификации ---
                if is_verification_message(raw_text):
                    log_msg = f"[{acc_name}] ⚠️ Словил запрос верификации в Дайвинчике! Пропускаем аккаунт."
                    logger.warning(log_msg)
                    await update_task(task_id, log=log_msg)
                    break

                # --- Поиск кнопок письма (Envelope) и действий ---
                envelope_btn_text = None
                has_dislike_btn = False
                has_like_btn = False

                # Проверяем ReplyKeyboardMarkup
                if last_msg.reply_markup and hasattr(last_msg.reply_markup, "keyboard"):
                    for row in last_msg.reply_markup.keyboard:
                        for btn in row:
                            t = btn.text or ""
                            if any(char in t for char in ENVELOPE_EMOJIS if char.strip()):
                                envelope_btn_text = t
                            if "👎" in t:
                                has_dislike_btn = True
                            if "❤️" in t or "❤" in t:
                                has_like_btn = True

                # Проверяем InlineKeyboardMarkup
                if not envelope_btn_text and last_msg.reply_markup and hasattr(last_msg.reply_markup, "inline_keyboard"):
                    for row in last_msg.reply_markup.inline_keyboard:
                        for btn in row:
                            t = btn.text or ""
                            if any(char in t for char in ENVELOPE_EMOJIS if char.strip()):
                                envelope_btn_text = t
                            if "👎" in t:
                                has_dislike_btn = True
                            if "❤️" in t or "❤" in t:
                                has_like_btn = True

                # Если есть кнопка письма
                if envelope_btn_text:
                    no_button_streak = 0
                    should_send_letter = random.randint(1, 100) <= envelope_chance

                    if should_send_letter:
                        # 1. Нажимаем кнопку письма
                        await push_bot_button(client, BOT_USERNAME, envelope_btn_text, envelope_btn_text)
                        
                        # 2. Имитируем размышление человека
                        env_sleep = random.randint(min_env_delay, max_env_delay)
                        logger.info(f"[{acc_name}] Имитация набора текста: ожидание {env_sleep} сек...")
                        
                        # Прерываемый сон
                        for _ in range(env_sleep):
                            if task_id in task_stop_flags:
                                await update_task(task_id, status="stopped", log="Остановлено пользователем")
                                return
                            await asyncio.sleep(1)

                        # 3. Генерируем сообщение со спинтаксом и синонимами
                        raw_tpl = random.choice(messages_pool)
                        msg_body = process_spintax(raw_tpl)
                        if synonyms_pool and random.choice([True, False]):
                            msg_body = f"{msg_body} {random.choice(synonyms_pool)}"

                        # 4. Имитируем статус typing
                        try:
                            await client.send_chat_action(BOT_USERNAME, "typing")
                            await asyncio.sleep(random.uniform(1.5, 3.0))
                        except Exception:
                            pass

                        # 5. Отправляем письмо!
                        await client.send_message(BOT_USERNAME, msg_body)
                        acc_messages += 1
                        total_messages_sent += 1
                        log_line = f"[{acc_name}] 💌 Письмо #{acc_messages}: \"{msg_body[:40]}...\""
                        logger.info(log_line)
                    else:
                        # Ставим дизлайк (👎) для естественности поведения
                        await asyncio.sleep(random.uniform(1.5, 3.0))
                        await push_bot_button(client, BOT_USERNAME, "👎", "👎")
                        log_line = f"[{acc_name}] 👎 Пропуск анкеты (рандомный дизлайк)"
                        logger.info(log_line)

                    acc_likes += 1
                elif has_like_btn or has_dislike_btn:
                    no_button_streak = 0
                    # Если нет письма, но есть кнопки ❤️ или 👎
                    await asyncio.sleep(random.uniform(1.5, 3.0))
                    if random.randint(1, 100) <= 60:
                        await push_bot_button(client, BOT_USERNAME, "❤️", "❤️")
                        acc_likes += 1
                    else:
                        await push_bot_button(client, BOT_USERNAME, "👎", "👎")
                else:
                    no_button_streak += 1
                    logger.debug(f"[{acc_name}] Кнопки не найдены (попытка {no_button_streak})")
                    if no_button_streak >= 3:
                        await client.send_message(BOT_USERNAME, "/start")
                        await asyncio.sleep(2)
                        await client.send_message(BOT_USERNAME, "1")
                        no_button_streak = 0
                    else:
                        await client.send_message(BOT_USERNAME, "1")
                        await asyncio.sleep(1.5)

                # Небольшая естественная пауза между анкетами
                step_pause = random.uniform(2.5, 5.0)
                await asyncio.sleep(step_pause)

            # Обновляем прогресс по аккаунтам
            processed_count = acc_idx + 1
            progress_pct = int((processed_count / total_accs) * 100)
            await update_task(
                task_id,
                progress=progress_pct,
                processed=processed_count,
                log=f"[{processed_count}/{total_accs}] {acc_name} завершил круг (писем: {acc_messages}, взаимок: {total_matches_found})"
            )

        except Exception as e:
            logger.error(f"Ошибка в цикле автолайкера {acc_name}: {e}")
            await update_task(task_id, log=f"[{acc_name}] Ошибка: {e}")

        # Пауза между переключением аккаунтов
        if acc_idx < total_accs - 1:
            await asyncio.sleep(random.randint(3, 7))

    await update_task(
        task_id,
        status="completed",
        progress=100,
        log=f"✅ Автолайкер завершил работу. Отправлено писем: {total_messages_sent}, Поймано взаимок: {total_matches_found}"
    )


# ==============================================================================
# 2. АВТОРЕГИСТРАТОР АНКЕТ В ДАЙВИНЧИКЕ (@leomatchbot)
# ==============================================================================

@task_scope_wrap("leomatch_register")
async def run_leomatch_register(task_id: str, account_names: List[str], options: Dict[str, Any]):
    """
    Пошаговая авторегистрация анкет в @leomatchbot через Pyrogram.
    """
    cities_pool = load_data_lines("data/cities.txt") or ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург"]
    names_pool = load_data_lines("data/names.txt") or ["Алексей", "Дмитрий", "Иван", "Максим", "Анна", "Елена"]
    about_pool = load_data_lines("data/about.txt") or ["{Привет!|Здравствуй!} {Ищу общение|Познакомлюсь для прогулок}"]
    channels_pool = load_data_lines("data/channels.txt")

    gender_choice = options.get("gender", "Я парень")            # "Я парень" / "Я девушка"
    search_gender = options.get("search_gender", "девушки")      # "девушки" / "парни" / "все равно"
    fixed_age = options.get("age")                               # int или None
    fixed_city = options.get("city")                             # str или None
    photos_dir = Path("uploads/leomatch")                        # Папка с фото для анкеты
    share_contact = bool(options.get("share_contact", True))
    join_channels = bool(options.get("join_channels", True))

    photo_files = []
    if photos_dir.exists():
        photo_files = [f for f in photos_dir.iterdir() if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]]

    total_accs = len(account_names)
    await update_task(
        task_id,
        status="running",
        total=total_accs,
        processed=0,
        progress=0,
        log=f"Старт авторегистрации анкет для {total_accs} аккаунтов..."
    )

    for idx, acc_name in enumerate(account_names):
        if task_id in task_stop_flags:
            await update_task(task_id, status="stopped", log="Остановлено пользователем")
            return

        client = await _get_client(acc_name)
        if not client:
            await update_task(task_id, log=f"[{acc_name}] ⚠️ Аккаунт не подключен, пропускаем")
            continue

        try:
            # Получаем номер телефона аккаунта для отправки контакта
            me = await client.get_me()
            phone_number = me.phone_number or ""
            if not phone_number.startswith("+"):
                phone_number = "+" + phone_number

            person_name = options.get("name") or (me.first_name if me.first_name else random.choice(names_pool))
            age = int(fixed_age) if fixed_age else random.choice([20, 21, 22, 23, 24, 25])
            city = fixed_city if fixed_city else random.choice(cities_pool)
            about_text = process_spintax(random.choice(about_pool))

            await update_task(
                task_id,
                log=f"[{idx + 1}/{total_accs}] {acc_name}: Регистрация анкеты ({person_name}, {age} лет, {city})..."
            )

            # 1. Разблокируем бота если в ЧС
            try:
                await client.unblock_user(BOT_USERNAME)
            except Exception:
                pass

            # 2. Шаг /start
            await client.send_message(BOT_USERNAME, "/start")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 3. Выбор языка: «🇷🇺 Русский»
            await push_bot_button(client, BOT_USERNAME, "русский", "🇷🇺 Русский")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 4. «👌 давай начнем»
            await push_bot_button(client, BOT_USERNAME, "начнем", "👌 давай начнем")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 5. «👌 Ok»
            await push_bot_button(client, BOT_USERNAME, "ок", "👌 Ok")
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 6. Возраст
            await client.send_message(BOT_USERNAME, str(age))
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 7. Пол
            await push_bot_button(client, BOT_USERNAME, "парень" if "парень" in gender_choice.lower() else "девушка", gender_choice)
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 8. Кого показывать
            await push_bot_button(client, BOT_USERNAME, search_gender.lower()[:5], search_gender)
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
                await client.send_photo(BOT_USERNAME, str(chosen_photo))
                await asyncio.sleep(random.uniform(3.5, 5.5))
                # Подтверждаем сохранение фото
                await push_bot_button(client, BOT_USERNAME, "сохранить", "Это все, сохранить фото")
                await asyncio.sleep(random.uniform(2.5, 4.0))

            # 13. Отправка контакта (верификация номера)
            if share_contact and phone_number:
                logger.info(f"[{acc_name}] Отправка контакта в бот ({phone_number})...")
                await client.send_contact(BOT_USERNAME, phone_number=phone_number, first_name=person_name)
                await asyncio.sleep(random.uniform(3.0, 5.0))

            # 14. Подтверждение анкеты
            await push_bot_button(client, BOT_USERNAME, "да", "Да")
            await asyncio.sleep(random.uniform(2.5, 4.0))

            # 15. Прогревочный лайк (❤️)
            await push_bot_button(client, BOT_USERNAME, "❤️", "❤️")
            await asyncio.sleep(random.uniform(2.0, 3.5))

            # 16. Прогревочная подписка на каналы
            if join_channels and channels_pool:
                chosen_chs = random.sample(channels_pool, min(2, len(channels_pool)))
                for ch in chosen_chs:
                    try:
                        await client.join_chat(ch)
                        await asyncio.sleep(random.uniform(1.5, 3.0))
                    except Exception:
                        pass

            processed_count = idx + 1
            pct = int((processed_count / total_accs) * 100)
            await update_task(
                task_id,
                progress=pct,
                processed=processed_count,
                log=f"[{processed_count}/{total_accs}] {acc_name}: ✅ Анкета успешно создана ({person_name}, {city})!"
            )

        except Exception as e:
            logger.error(f"Ошибка регистрации анкеты для {acc_name}: {e}")
            await update_task(task_id, log=f"[{acc_name}] ❌ Ошибка регистрации: {e}")

        # Пауза между аккаунтами
        if idx < total_accs - 1:
            await asyncio.sleep(random.randint(5, 12))

    await update_task(
        task_id,
        status="completed",
        progress=100,
        log=f"✅ Авторегистрация анкет завершена для {total_accs} аккаунтов!"
    )
# ==============================================================================
# 3. ИНТЕЛЛЕКТУАЛЬНЫЙ ПРОГРЕВ АНКЕТЫ В ДАЙВИНЧИКЕ (@leomatchbot)
# ==============================================================================
# 5. ИНТЕЛЛЕКТУАЛЬНЫЙ ПОЧАСОВОЙ ПРОГРЕВ АНКЕТЫ В @LEOMATCHBOT
# ==============================================================================

async def _ensure_boost_channel(client, acc_name: str, channel_username: str, mute_channel: bool):
    """Подписка на прогревочный канал и установка режима Без звука (Mute)."""
    try:
        await client.join_chat(channel_username)
        logger.info(f"[{acc_name}] Подписались на прогревочный канал @{channel_username}")
        if mute_channel:
            try:
                from pyrogram.raw import functions as raw_functions, types as raw_types
                peer = await client.resolve_peer(channel_username)
                await client.invoke(
                    raw_functions.account.UpdateNotifySettings(
                        peer=raw_types.InputNotifyPeer(peer=peer),
                        settings=raw_types.InputPeerNotifySettings(
                            mute_until=2147483647,
                            silent=True,
                            show_previews=False
                        )
                    )
                )
                logger.info(f"[{acc_name}] Канал @{channel_username} переведен в беззвучный режим (Mute)")
            except Exception as mute_err:
                logger.warning(f"[{acc_name}] Не удалось отключить звук для @{channel_username}: {mute_err}")
    except Exception as join_err:
        logger.warning(f"[{acc_name}] Не удалось подписаться на @{channel_username}: {join_err}")


async def _warmup_swipe_account(
    client,
    acc_name: str,
    target_likes: int,
    delay_min: float,
    delay_max: float,
    enable_dislikes: bool,
    dislike_chance: int,
    react_incoming_likes: bool,
    task_id: str,
    progress_prefix: str = "",
    stop_on_first_match: bool = False,
    is_time_expired_fn = None
) -> Dict[str, Any]:
    """
    Выполняет одну сессию свайпов для одного аккаунта.
    Взаимные симпатии на этапе прогрева НЕ сохраняются в базу лидов leomatch_matches.
    При включенном stop_on_first_match аккаунт завершает сессию сразу при первой взаимке.
    """
    likes_done = 0
    dislikes_done = 0
    matches_done = 0

    try:
        try:
            await client.unblock_user(BOT_USERNAME)
        except Exception:
            pass

        # Инициализация просмотра анкет в боте
        await client.send_message(BOT_USERNAME, "1")
        await asyncio.sleep(2.0)

        no_button_streak = 0
        attempts = 0

        while likes_done < target_likes and attempts < 60:
            attempts += 1
            if task_id in task_stop_flags:
                break

            if is_time_expired_fn and is_time_expired_fn():
                logger.info(f"[{acc_name}] ⏱️ Время прогрева истекло, завершаем свайпы аккаунта.")
                break

            last_msg = None
            async for m in client.get_chat_history(BOT_USERNAME, limit=1):
                last_msg = m
                break

            if not last_msg:
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            raw_text = last_msg.text or getattr(last_msg, "caption", "") or ""
            lower_text = raw_text.lower()

            # 1. Суточный лимит лайков
            if is_daily_limit_message(lower_text):
                logger.info(f"[{acc_name}] 🛑 Суточный лимит лайков бота достигнут.")
                await update_task(task_id, log=f"{progress_prefix}[{acc_name}] 🛑 Суточный лимит лайков бота.")
                break

            # 2. Запрос верификации (селфи / видео)
            if is_verification_message(lower_text):
                logger.warning(f"[{acc_name}] ⚠️ Требуется видео-верификация в Дайвинчике! Пропускаем.")
                await update_task(task_id, log=f"{progress_prefix}[{acc_name}] ⚠️ Требуется видео-верификация селфи.")
                break

            # 3. Верификация пройдена
            if "верификация пройдена" in lower_text:
                await client.send_message(BOT_USERNAME, "➡️")
                await asyncio.sleep(2.0)
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            # 4. Взаимная симпатия (на этапе прогрева НЕ СОХРАНЯЕМ в базу целевых лидов!)
            if is_mutual_match_message(lower_text):
                matches_done += 1
                m_lead = extract_lead_from_text(raw_text, last_msg)
                lead_label = f"@{m_lead.get('username')}" if m_lead.get('username') else (m_lead.get('name') or "Лид")
                logger.info(f"[{acc_name}] 💌 Взаимная симпатия на прогреве ({lead_label}). Пропускаем сохранение в целевые лиды.")

                if stop_on_first_match:
                    logger.info(f"[{acc_name}] 🎯 Остановка аккаунта по условию: первая взаимная симпатия получена!")
                    await update_task(task_id, log=f"{progress_prefix}[{acc_name}] 🎉 Первая взаимка получена ({lead_label})! Прогрев аккаунта успешно выполнен.")
                    return {"likes": likes_done, "dislikes": dislikes_done, "matches": matches_done, "matched": True}

                await update_task(task_id, log=f"{progress_prefix}[{acc_name}] 💌 Взаимка ({lead_label}) на прогреве (не сохраняется в базу).")
                await asyncio.sleep(2.0)
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            # 5. Входящая симпатия ("Ты понравился 1 девушке... / Кому-то понравилась твоя анкета")
            if is_incoming_like_message(lower_text):
                logger.info(f"[{acc_name}] 💌 Входящая симпатия в боте. Смотрим анкету поклонника...")
                btn_pushed, _ = await push_bot_button(client, BOT_USERNAME, "показать", "1")
                if not btn_pushed:
                    await client.send_message(BOT_USERNAME, "1")

                admirer_msg = None
                for _ in range(5):
                    await asyncio.sleep(0.8)
                    async for m in client.get_chat_history(BOT_USERNAME, limit=2):
                        if m.reply_markup and (hasattr(m.reply_markup, "keyboard") or hasattr(m.reply_markup, "inline_keyboard")):
                            admirer_msg = m
                            break
                    if admirer_msg:
                        break

                if react_incoming_likes and admirer_msg:
                    # Ставим ответный лайк для нагуливания естественного поведенческого траста
                    logger.info(f"[{acc_name}] ❤️ Ответный лайк поклоннику на прогреве...")
                    liked_ok, _ = await push_bot_button(client, BOT_USERNAME, "❤️", "❤️")
                    if not liked_ok:
                        await push_bot_button(client, BOT_USERNAME, "❤", "❤️")
                    likes_done += 1

                await asyncio.sleep(2.0)
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            # 6. Меню бота
            if is_menu_message(lower_text):
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            # 7. Буст канала
            if is_boost_channel_message(lower_text):
                await client.send_message(BOT_USERNAME, "1")
                await asyncio.sleep(2.0)
                continue

            # 8. Обычная анкета для свайпа
            buttons = get_message_buttons(last_msg)
            if not buttons:
                async for prev_m in client.get_chat_history(BOT_USERNAME, limit=3):
                    b_list = get_message_buttons(prev_m)
                    if b_list:
                        buttons = b_list
                        break

            has_like = any("❤️" in b or "❤" in b for b in buttons)
            has_dislike = any("👎" in b for b in buttons)

            if has_like or has_dislike:
                no_button_streak = 0
                is_dislike = enable_dislikes and (random.randint(1, 100) <= dislike_chance)

                if is_dislike and has_dislike:
                    pushed, _ = await push_bot_button(client, BOT_USERNAME, "👎", "👎")
                    if not pushed:
                        await client.send_message(BOT_USERNAME, "👎")
                    dislikes_done += 1
                    logger.info(f"[{acc_name}] 👎 Поставлен дизлайк #{dislikes_done}")
                else:
                    liked, _ = await push_bot_button(client, BOT_USERNAME, "❤️", "❤️")
                    if not liked:
                        liked, _ = await push_bot_button(client, BOT_USERNAME, "❤", "❤️")
                    if not liked:
                        await client.send_message(BOT_USERNAME, "❤️")
                    likes_done += 1
                    logger.info(f"[{acc_name}] ❤️ Поставлен лайк #{likes_done}/{target_likes}")

                status_line = f"{progress_prefix}[{acc_name}]: {likes_done}/{target_likes} лайков (дизлайков: {dislikes_done})"
                await update_task(task_id, log=status_line)

                if likes_done >= target_likes:
                    break

                # Пауза между действиями с проверкой кнопки Стоп и таймера каждую секунду
                sleep_time = random.uniform(delay_min, delay_max)
                for _ in range(int(sleep_time)):
                    if task_id in task_stop_flags or (is_time_expired_fn and is_time_expired_fn()):
                        break
                    await asyncio.sleep(1)
                rem = sleep_time - int(sleep_time)
                if rem > 0 and task_id not in task_stop_flags and not (is_time_expired_fn and is_time_expired_fn()):
                    await asyncio.sleep(rem)
            else:
                no_button_streak += 1
                if no_button_streak >= 3:
                    await client.send_message(BOT_USERNAME, "/start")
                    await asyncio.sleep(2)
                    await client.send_message(BOT_USERNAME, "1")
                    no_button_streak = 0
                else:
                    await client.send_message(BOT_USERNAME, "1")
                    await asyncio.sleep(2.0)

    except Exception as e:
        logger.error(f"[{acc_name}] Ошибка в сессии прогрева: {e}")
        await update_task(task_id, log=f"{progress_prefix}[{acc_name}] ⚠️ Ошибка: {e}")

    return {"likes": likes_done, "dislikes": dislikes_done, "matches": matches_done, "matched": matches_done > 0}


async def save_warmup_checkpoint(
    task_id: str,
    state: Dict[str, Any],
    progress: Optional[int] = None,
    log_msg: Optional[str] = None,
    status: Optional[str] = None,
    processed: Optional[int] = None
):
    """
    Периодически сохраняет контрольную точку задачи в background_tasks
    для возможности бесшовного восстановления прогрева после перезапуска программы.
    """
    state_str = json.dumps(state, ensure_ascii=False)
    sets = ["state_json = ?"]
    vals = [state_str]
    if progress is not None:
        sets.append("progress = ?")
        vals.append(progress)
    if status is not None:
        sets.append("status = ?")
        vals.append(status)
    if log_msg is not None:
        sets.append("log = ?")
        vals.append(log_msg)
    if processed is not None:
        sets.append("processed = ?")
        vals.append(processed)
    vals.append(task_id)

    try:
        async with get_db() as db:
            await db.execute(f"UPDATE background_tasks SET {', '.join(sets)} WHERE id = ?", vals)
            await db.commit()

        # WebSocket broadcast для отображения прогресса в реальном времени
        await manager.broadcast({
            "type": "task_update",
            "task": {
                "id": task_id,
                "task_type": "leomatch_warmup",
                "status": status or "running",
                "progress": progress if progress is not None else state.get("progress", 0),
                "log": log_msg or "",
                "processed": processed if processed is not None else state.get("processed", 0),
                "state": state
            }
        })
    except Exception as e:
        logger.debug(f"Ошибка сохранения чекпоинта задачи {task_id}: {e}")


@task_scope_wrap("leomatch_warmup")
async def run_leomatch_warmup(
    task_id: str,
    account_names: List[str],
    config: Dict[str, Any],
    resume_state: Optional[Dict[str, Any]] = None
):
    """
    Интеллектуальный прогрев анкет в @leomatchbot с поддержкой:
    - Критериев остановки: 'infinite' (до ручной остановки), 'first_match' (до первой взаимки), 'time_limit' (по времени)
    - Почасового сессионного расписания или разового режима ('interval' / 'once')
    - Дневного окна активности (автопауза на ночь)
    - Сохранения контрольных точек (Crash Recovery) для продолжения после сбоя или перезапуска
    - Живого прогресс-бара и таймеров обратного отсчета
    """
    warmup_mode = str(config.get("warmup_mode", "interval")).lower()  # "interval" или "once"
    stop_condition = str(config.get("stop_condition", "infinite")).lower()  # "infinite", "first_match", "time_limit"
    duration_minutes = float(config.get("duration_minutes", 0))
    stop_on_first_match = (stop_condition == "first_match") or bool(config.get("stop_on_first_match", False))

    # Параметры сессионного прогрева по часам
    session_likes_min = int(config.get("session_likes_min", 2))
    session_likes_max = int(config.get("session_likes_max", 4))
    if session_likes_min > session_likes_max:
        session_likes_min, session_likes_max = session_likes_max, session_likes_min
    if session_likes_min < 1:
        session_likes_min = 1

    interval_hours_min = float(config.get("interval_hours_min", 2.0))
    interval_hours_max = float(config.get("interval_hours_max", 4.0))
    if interval_hours_min > interval_hours_max:
        interval_hours_min, interval_hours_max = interval_hours_max, interval_hours_min
    if interval_hours_min < 0.1:
        interval_hours_min = 0.1

    total_sessions = int(config.get("total_sessions", 0))  # 0 = бессрочно/пока не остановят вручную

    active_hours_enabled = bool(config.get("active_hours_enabled", True))
    active_hours_start = int(config.get("active_hours_start", 9))   # 09:00
    active_hours_end = int(config.get("active_hours_end", 23))      # 23:00

    # Параметры разового режима (если выбран warmup_mode == "once")
    likes_min = int(config.get("likes_min", 15))
    likes_max = int(config.get("likes_max", 30))
    if likes_min > likes_max:
        likes_min, likes_max = likes_max, likes_min
    if likes_min < 1:
        likes_min = 1

    # Задержки между действиями
    delay_min = float(config.get("delay_min", 12))
    delay_max = float(config.get("delay_max", 35))
    if delay_min > delay_max:
        delay_min, delay_max = delay_max, delay_min
    if delay_min < 1:
        delay_min = 1.0

    enable_dislikes = bool(config.get("enable_dislikes", True))
    dislike_chance = int(config.get("dislike_chance", 30))

    subscribe_channel = bool(config.get("subscribe_channel", True))
    channel_username = str(config.get("channel_username", BOOST_CHANNEL)).strip().lstrip("@")
    if not channel_username:
        channel_username = BOOST_CHANNEL
    mute_channel = bool(config.get("mute_channel", True))

    react_incoming_likes = bool(config.get("react_incoming_likes", True))

    total_accs = len(account_names)

    # Инициализация или восстановление состояния
    if resume_state:
        start_ts = float(resume_state.get("start_ts", time.time()))
        session_idx = int(resume_state.get("session_idx", 1))
        total_likes_all = int(resume_state.get("total_likes", 0))
        total_dislikes_all = int(resume_state.get("total_dislikes", 0))
        total_matches_all = int(resume_state.get("total_matches", 0))
        account_states = resume_state.get("account_states", {})
        for a in account_names:
            if a not in account_states:
                account_states[a] = {"likes": 0, "dislikes": 0, "matched": False, "completed": False}
        logger.info(f"[{task_id}] 🔄 Восстановление прогрева: сессия #{session_idx}, уже выполнено {total_likes_all} ❤️, {total_dislikes_all} 👎")
    else:
        start_ts = time.time()
        session_idx = 0
        total_likes_all = 0
        total_dislikes_all = 0
        total_matches_all = 0
        account_states = {a: {"likes": 0, "dislikes": 0, "matched": False, "completed": False} for a in account_names}

    duration_seconds = int(duration_minutes * 60) if duration_minutes > 0 else 0
    deadline_ts = (start_ts + duration_seconds) if (stop_condition == "time_limit" and duration_seconds > 0) else None

    def is_time_expired() -> bool:
        if deadline_ts is not None:
            return time.time() >= deadline_ts
        return False

    def compute_current_progress() -> Tuple[int, str]:
        """Возвращает (progress_percent, progress_label)"""
        now = time.time()
        elapsed_secs = max(0, int(now - start_ts))
        elapsed_mins = elapsed_secs // 60

        if stop_condition == "time_limit" and duration_seconds > 0:
            prog = min(100, max(0, int((elapsed_secs / duration_seconds) * 100)))
            mins_left = max(0, int((deadline_ts - now) // 60))
            if duration_minutes >= 60:
                h_el = elapsed_mins // 60
                m_el = elapsed_mins % 60
                label = f"[{h_el}ч {m_el}м / {duration_minutes/60:.1f}ч, ост. {mins_left//60}ч {mins_left%60}м ({prog}%)]"
            else:
                label = f"[{elapsed_mins}м / {int(duration_minutes)}м, ост. {mins_left}м ({prog}%)]"
            return prog, label

        elif stop_condition == "first_match":
            matched_count = sum(1 for a in account_states.values() if a.get("matched"))
            prog = min(100, int((matched_count / max(1, total_accs)) * 100))
            label = f"[Взаимок: {matched_count}/{total_accs} ({prog}%)]"
            return prog, label

        else:
            h_el = elapsed_mins // 60
            m_el = elapsed_mins % 60
            prog = min(95, session_idx * 5) if session_idx > 0 else 5
            label = f"[В работе: {h_el:02d}:{m_el:02d}]"
            return prog, label

    def build_checkpoint_state() -> Dict[str, Any]:
        cur_prog, cur_label = compute_current_progress()
        return {
            "start_ts": start_ts,
            "stop_condition": stop_condition,
            "duration_minutes": duration_minutes,
            "stop_on_first_match": stop_on_first_match,
            "elapsed_seconds": int(time.time() - start_ts),
            "session_idx": session_idx,
            "total_likes": total_likes_all,
            "total_dislikes": total_dislikes_all,
            "total_matches": total_matches_all,
            "progress": cur_prog,
            "progress_label": cur_label,
            "account_states": account_states,
            "last_checkpoint_ts": int(time.time())
        }

    crit_text = (
        f"до {int(duration_minutes)}м" if stop_condition == "time_limit" else
        ("до первой взаимки" if stop_condition == "first_match" else "бессрочно")
    )
    init_desc = (
        f"Почасовой прогрев {total_accs} акк. ({crit_text}, по {session_likes_min}-{session_likes_max} лайков каждые {interval_hours_min:g}-{interval_hours_max:g}ч)"
        if warmup_mode == "interval" else
        f"Разовый прогрев {total_accs} акк. ({crit_text}, по {likes_min}-{likes_max} лайков)"
    )

    cur_p, cur_lbl = compute_current_progress()
    await save_warmup_checkpoint(
        task_id,
        state=build_checkpoint_state(),
        status="running",
        progress=cur_p,
        processed=0,
        log_msg=f"{'Возобновлено' if resume_state else 'Инициализация'}: {init_desc} {cur_lbl}"
    )

    while True:
        if task_id in task_stop_flags:
            await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="stopped", log_msg="Остановлено пользователем")
            return

        # Проверка истечения времени прогрева
        if is_time_expired():
            cur_p, cur_lbl = compute_current_progress()
            summary_time = f"✅ Время прогрева ({int(duration_minutes)} мин) истекло! Прогрев успешно завершен. Всего лайков: {total_likes_all}, дизлайков: {total_dislikes_all}."
            await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, processed=total_accs, log_msg=summary_time)
            return

        # Проверка достижения взаимок всеми аккаунтами
        if stop_condition == "first_match":
            matched_count = sum(1 for a in account_states.values() if a.get("matched"))
            if matched_count >= total_accs and total_accs > 0:
                summary_match = f"🎉 Все {total_accs} аккаунтов получили первую взаимную симпатию! Прогрев успешно завершен. Лайков: {total_likes_all}."
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, processed=total_accs, log_msg=summary_match)
                return

        session_idx += 1

        # Проверка лимита сессий (если задан)
        if total_sessions > 0 and session_idx > total_sessions:
            summary_done = f"✅ Прогрев успешно завершен! Выполнено {total_sessions} сессий. Всего лайков: {total_likes_all}, дизлайков: {total_dislikes_all}."
            await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, processed=total_accs, log_msg=summary_done)
            return

        # Проверка дневного окна активности (Ночной спящий режим)
        if active_hours_enabled:
            now_dt = datetime.now()
            cur_h = now_dt.hour
            is_active_window = (
                (active_hours_start <= cur_h < active_hours_end)
                if active_hours_start < active_hours_end
                else (cur_h >= active_hours_start or cur_h < active_hours_end)
            )

            if not is_active_window:
                next_morning = now_dt.replace(hour=active_hours_start, minute=0, second=0, microsecond=0)
                if next_morning <= now_dt:
                    next_morning += timedelta(days=1)
                night_secs = max(60, int((next_morning - now_dt).total_seconds()))
                wake_str = next_morning.strftime("%H:%M")
                log_night = f"🌙 Ночной режим. Пауза до {wake_str} (возобновление в {active_hours_start:02d}:00)..."
                logger.info(f"[{task_id}] {log_night}")
                cur_p, cur_lbl = compute_current_progress()
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), progress=cur_p, log_msg=f"{log_night} {cur_lbl}")

                slept_night = 0
                while slept_night < night_secs:
                    if task_id in task_stop_flags:
                        await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="stopped", log_msg="Остановлено пользователем")
                        return
                    if is_time_expired():
                        summary_time = f"✅ Время прогрева истекло во время ночного режима. Прогрев завершен."
                        await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, log_msg=summary_time)
                        return

                    await asyncio.sleep(1)
                    slept_night += 1
                    if slept_night % 300 == 0:
                        cur_p, cur_lbl = compute_current_progress()
                        rem_m = (night_secs - slept_night) // 60
                        await save_warmup_checkpoint(
                            task_id,
                            state=build_checkpoint_state(),
                            progress=cur_p,
                            log_msg=f"🌙 Ночной режим: до старта сессии осталось {rem_m} мин (до {wake_str})... {cur_lbl}"
                        )

        # Старт очередной сессии прогрева
        prefix = f"[Сессия #{session_idx}] " if warmup_mode == "interval" else ""
        cur_p, cur_lbl = compute_current_progress()
        sess_title = f"▶️ {prefix}Старт прогрева {total_accs} аккаунтов... {cur_lbl}"
        logger.info(f"[{task_id}] {sess_title}")
        await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="running", progress=cur_p, log_msg=sess_title)

        for acc_idx, acc_name in enumerate(account_names):
            if task_id in task_stop_flags:
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="stopped", log_msg="Остановлено пользователем")
                return

            if is_time_expired():
                summary_time = f"✅ Время прогрева ({int(duration_minutes)} мин) истекло! Прогрев завершен. Поставлено {total_likes_all} ❤️."
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, log_msg=summary_time)
                return

            # Если аккаунт уже нашел взаимку и включен режим stop_on_first_match — пропускаем его
            if stop_on_first_match and account_states.get(acc_name, {}).get("matched"):
                continue

            client = await _get_client(acc_name)
            if not client:
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), log_msg=f"{prefix}[{acc_name}] ⚠️ Аккаунт не подключен, пропускаем")
                continue

            # На первой сессии проверяем подписку на прогревочный канал
            if session_idx == 1 and subscribe_channel:
                await _ensure_boost_channel(client, acc_name, channel_username, mute_channel)

            target_for_acc = (
                random.randint(session_likes_min, session_likes_max)
                if warmup_mode == "interval"
                else random.randint(likes_min, likes_max)
            )

            acc_prefix = f"{prefix}[{acc_idx + 1}/{total_accs}] "
            cur_p, cur_lbl = compute_current_progress()
            await save_warmup_checkpoint(
                task_id,
                state=build_checkpoint_state(),
                progress=cur_p,
                log_msg=f"{acc_prefix}{acc_name}: цель {target_for_acc} лайков... {cur_lbl}"
            )

            res = await _warmup_swipe_account(
                client=client,
                acc_name=acc_name,
                target_likes=target_for_acc,
                delay_min=delay_min,
                delay_max=delay_max,
                enable_dislikes=enable_dislikes,
                dislike_chance=dislike_chance,
                react_incoming_likes=react_incoming_likes,
                task_id=task_id,
                progress_prefix=acc_prefix,
                stop_on_first_match=stop_on_first_match,
                is_time_expired_fn=is_time_expired
            )

            total_likes_all += res["likes"]
            total_dislikes_all += res["dislikes"]
            total_matches_all += res["matches"]

            # Обновляем состояние данного аккаунта в checkpoint
            prev_acc_st = account_states.get(acc_name, {})
            account_states[acc_name] = {
                "likes": prev_acc_st.get("likes", 0) + res["likes"],
                "dislikes": prev_acc_st.get("dislikes", 0) + res["dislikes"],
                "matched": prev_acc_st.get("matched", False) or res.get("matched", False),
                "completed": res.get("matched", False) if stop_on_first_match else False
            }

            cur_p, cur_lbl = compute_current_progress()
            matched_badge = " [💌 Взаимка!]" if res.get("matched") else ""
            await save_warmup_checkpoint(
                task_id,
                state=build_checkpoint_state(),
                progress=cur_p,
                processed=acc_idx + 1,
                log_msg=f"{acc_prefix}{acc_name} завершил: +{res['likes']} ❤️, +{res['dislikes']} 👎{matched_badge} {cur_lbl}"
            )

            # Проверяем, если режим первой взаимки и все аккаунты достигли цели
            if stop_on_first_match:
                matched_count = sum(1 for a in account_states.values() if a.get("matched"))
                if matched_count >= total_accs and total_accs > 0:
                    summary_match = f"🎉 Все {total_accs} аккаунтов получили первую взаимную симпатию! Прогрев успешно завершен."
                    await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, processed=total_accs, log_msg=summary_match)
                    return

            # Пауза между аккаунтами пула
            if acc_idx < total_accs - 1:
                await asyncio.sleep(random.uniform(4, 10))

        # Если выбран разовый режим — завершаем задачу после первого прохода
        if warmup_mode == "once":
            summary_once = f"✅ Разовый прогрев завершен! Поставлено лайков: {total_likes_all}, дизлайков: {total_dislikes_all}."
            await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, processed=total_accs, log_msg=summary_once)
            return

        # Иначе — рассчитываем интервал сна перед следующим подходом
        interval_hours = random.uniform(interval_hours_min, interval_hours_max)
        interval_secs = int(interval_hours * 3600)
        next_time_dt = datetime.now() + timedelta(seconds=interval_secs)
        next_time_str = next_time_dt.strftime("%H:%M")

        wait_log = (
            f"☕ Сессия #{session_idx} завершена ({total_accs} акк). "
            f"Следующий подход через {interval_hours:.1f} ч (в {next_time_str}). "
            f"Всего: {total_likes_all} ❤️, {total_dislikes_all} 👎."
        )
        logger.info(f"[{task_id}] {wait_log}")
        cur_p, cur_lbl = compute_current_progress()
        await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), progress=cur_p, log_msg=f"{wait_log} {cur_lbl}")

        # Ожидание с ежесекундной проверкой флага остановки, таймера и периодическим обновлением счетчика
        slept_secs = 0
        while slept_secs < interval_secs:
            if task_id in task_stop_flags:
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="stopped", log_msg="Остановлено пользователем")
                return

            if is_time_expired():
                cur_p, cur_lbl = compute_current_progress()
                summary_time = f"✅ Заданное время прогрева ({int(duration_minutes)} мин) истекло во время ожидания сессии. Прогрев успешно завершен!"
                await save_warmup_checkpoint(task_id, state=build_checkpoint_state(), status="completed", progress=100, log_msg=summary_time)
                return

            await asyncio.sleep(1)
            slept_secs += 1

            if slept_secs % 30 == 0:
                cur_p, cur_lbl = compute_current_progress()
                mins_left_inter = (interval_secs - slept_secs) // 60
                await save_warmup_checkpoint(
                    task_id,
                    state=build_checkpoint_state(),
                    progress=cur_p,
                    log_msg=f"⏳ Пауза между сессиями: до подхода #{session_idx + 1} осталось {mins_left_inter} мин (в {next_time_str}). Всего: {total_likes_all} ❤️... {cur_lbl}"
                )


async def resume_interrupted_warmup_tasks():
    """
    Сканирует базу данных на наличие незавершенных задач прогрева ('running' или 'pending')
    и автоматически восстанавливает их выполнение ровно с того места, где они прервались
    (например, после перезапуска программы, вылета софта или перезагрузки устройства).
    """
    logger.info("🔍 Проверка незавершенных задач прогрева для восстановления...")
    resumed_count = 0
    try:
        async with get_db() as db:
            cursor = await db.execute("""
                SELECT id, account_names, config, state_json, created_at 
                FROM background_tasks 
                WHERE task_type = 'leomatch_warmup' AND status = 'running'
            """)
            rows = await cursor.fetchall()

        if not rows:
            logger.info("✅ Незавершенных задач прогрева не обнаружено.")
            return 0

        for row in rows:
            t_id, acc_names_str, cfg_str, state_str, created_at = row
            if t_id in running_tasks and not running_tasks[t_id].done():
                continue

            account_names = [a.strip() for a in (acc_names_str or "").split(",") if a.strip()]
            if not account_names:
                continue

            config = json.loads(cfg_str) if cfg_str else {}
            state = json.loads(state_str) if state_str else {}

            stop_condition = str(config.get("stop_condition", state.get("stop_condition", "infinite"))).lower()
            duration_minutes = float(config.get("duration_minutes", state.get("duration_minutes", 0)))
            start_ts = float(state.get("start_ts", created_at or time.time()))

            # Проверяем, не истек ли лимит времени во время оффлайна
            if stop_condition == "time_limit" and duration_minutes > 0:
                elapsed = time.time() - start_ts
                if elapsed >= (duration_minutes * 60):
                    log_done = f"✅ Прогрев завершен (заданный лимит времени {int(duration_minutes)} мин истек во время перезапуска программы)."
                    logger.info(f"[{t_id}] {log_done}")
                    await update_task(t_id, status="completed", progress=100, log=log_done)
                    continue

            # Проверяем, не достигли ли все аккаунты взаимки
            if stop_condition == "first_match":
                acc_states = state.get("account_states", {})
                remaining = [a for a in account_names if not acc_states.get(a, {}).get("matched")]
                if not remaining:
                    log_done = "✅ Прогрев завершен (все аккаунты уже получили взаимную симпатию)."
                    logger.info(f"[{t_id}] {log_done}")
                    await update_task(t_id, status="completed", progress=100, log=log_done)
                    continue

            # Проверяем доступность аккаунтов и регистрируем задачу
            acquired, busy = task_manager.try_acquire_accounts(account_names, t_id, "leomatch_warmup")
            if not acquired:
                logger.warning(f"[{t_id}] Не удалось возобновить прогрев: аккаунты уже заняты ({busy})")
                continue

            recovery_msg = f"🔄 Программа перезапущена. Задача прогрева автоматически восстановлена с последнего состояния."
            logger.info(f"[{t_id}] {recovery_msg}")
            await update_task(t_id, log=recovery_msg)

            new_task = asyncio.create_task(run_leomatch_warmup(t_id, account_names, config, resume_state=state))
            task_manager.register_task(t_id, new_task, "leomatch_warmup", account_names)
            resumed_count += 1
            logger.info(f"[{t_id}] 🚀 Фоновый прогрев успешно продолжен!")

    except Exception as e:
        logger.error(f"Ошибка восстановления задач прогрева: {e}")

    return resumed_count

