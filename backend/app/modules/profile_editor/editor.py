import asyncio
import json
import random
import re
from pathlib import Path
from typing import List, Optional, Dict, Any
from telethon import TelegramClient
from telethon.tl.functions.account import (
    UpdateProfileRequest, UpdateUsernameRequest, SetPrivacyRequest, CheckUsernameRequest
)
from telethon.tl.functions.photos import UploadProfilePhotoRequest
from telethon.tl.types import (
    InputPrivacyKeyPhoneNumber, InputPrivacyKeyAddedByPhone,
    InputPrivacyKeyStatusTimestamp, InputPrivacyKeyPhoneCall,
    InputPrivacyKeyPhoneP2P, InputPrivacyKeyChatInvite,
    InputPrivacyValueDisallowAll, InputPrivacyValueAllowContacts
)
from telethon.errors import (
    UsernameOccupiedError, UsernameInvalidError, UsernameNotModifiedError, FloodWaitError
)
from app.core.logger import logger
from app.db.database import db
from app.services.task_engine import task_engine
from app.telegram.client_manager import client_manager

TRANSLIT = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
}

def transliterate(text: str) -> str:
    """Транслитерация русского текста в латиницу."""
    return ''.join(TRANSLIT.get(c, c) for c in (text or '').lower())

def load_data_lines(file_path: str) -> List[str]:
    """Загрузка строк из текстового пула."""
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
    """Обрабатывает спинтакс: {Вариант 1|Вариант 2}."""
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

async def set_unique_username(client: TelegramClient, first_name: str, last_name: str) -> Optional[str]:
    """Генерация и установка уникального человекоподобного @username с проверкой MTProto."""
    base_name = transliterate(first_name) or "user"
    base_surname = transliterate(last_name) or "tg"
    base_name = ''.join(c for c in base_name if c.isalnum() or c == '_')
    base_surname = ''.join(c for c in base_surname if c.isalnum() or c == '_')
    if not base_name:
        base_name = "user"
    if not base_surname:
        base_surname = "tg"

    year = random.randint(1996, 2006)
    short_year = year % 100
    candidates = [
        f"{base_name}_{base_surname}",
        f"{base_surname}_{base_name}",
        f"{base_name}{base_surname}",
        f"{base_name}_{base_surname}{year}",
        f"{base_surname}{base_name}{short_year}",
        f"{base_name}_{base_surname}_{random.randint(10, 99)}",
        f"{base_name}{year}_{base_surname[:3]}",
        f"{base_name}_{base_surname}{random.randint(100, 999)}",
        f"{base_name}{random.randint(1, 9)}_{base_surname}",
        f"{base_surname[:4]}_{base_name}{random.randint(10, 99)}",
        f"{base_name}_{random.randint(10, 99)}_{base_surname[:4]}",
        f"{base_name}{base_surname[:3]}{random.randint(10, 999)}",
        f"real_{base_name}_{base_surname[:3]}",
        f"{base_name}_{base_surname[:5]}_{random.randint(1, 99)}",
    ]
    random.shuffle(candidates)

    for cand in candidates[:15]:
        cand = cand.replace('.', '_')
        if len(cand) < 5:
            cand = f"{cand}{random.randint(100, 999)}"
        cand = cand[:32]
        try:
            available = await client(CheckUsernameRequest(username=cand))
            if not available:
                continue
            await client(UpdateUsernameRequest(username=cand))
            return cand
        except (UsernameOccupiedError, UsernameInvalidError, UsernameNotModifiedError):
            continue
        except FloodWaitError as e:
            if e.seconds <= 5:
                await asyncio.sleep(e.seconds + 1)
                continue
            break
        except Exception:
            continue

    # Резервная попытка
    try:
        fallback = f"{base_name[:6]}_{base_surname[:4]}_{random.randint(1000, 9999)}"[:32]
        available = await client(CheckUsernameRequest(username=fallback))
        if available:
            await client(UpdateUsernameRequest(username=fallback))
            return fallback
    except Exception:
        pass
    return None

def save_session_2fa(clean_phone: str, password: str, hint: str = ""):
    """Запись пароля 2FA в метаданные сессии .json для надежного хранения."""
    for base_dir in [Path("backend/sessions"), Path("sessions")]:
        if base_dir.exists():
            for p in base_dir.glob(f"*{clean_phone}*.json"):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    data["two_fa_password"] = password
                    data["two_fa_hint"] = hint
                    data["password"] = password
                    with open(p, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                except Exception as e:
                    logger.debug(f"Не удалось записать 2FA в {p}: {e}")

async def run_batch_profile_update(
    task_id: str,
    account_phones: List[str],
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    bio: Optional[str] = None,
    set_username: bool = False,
    set_avatar: bool = False,
    enable_2fa: bool = False,
    two_fa_password: Optional[str] = None,
    two_fa_hint: Optional[str] = "farm",
    hide_phone: bool = True,
    hide_search_by_phone: bool = True,
    hide_last_seen: bool = False,
    block_calls: bool = True,
    block_p2p: bool = True,
    block_invites: bool = True
):
    """
    Массовое автозаполнение профилей, генерация юзернеймов, аватарки, 2FA и приватность.
    """
    names_pool = load_data_lines("names.txt") or ["Алексей", "Дмитрий", "Иван", "Максим", "Анна", "Елена"]
    surnames_pool = load_data_lines("surnames.txt") or ["Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев"]
    bios_pool = load_data_lines("bio.txt") or ["{Привет!|Здравствуйте!} {На связи|В сети|Пишите по вопросам}"]

    avatars_dir = Path("backend/uploads/avatars")
    if not avatars_dir.exists():
        avatars_dir = Path("uploads/avatars")

    avatar_files = []
    if set_avatar and avatars_dir.exists():
        avatar_files = [
            f for f in avatars_dir.iterdir()
            if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
        ]

    total = len(account_phones)
    processed = 0

    await task_engine.update_progress(task_id, processed=0, total=total, log_line=f"Старт настройки профилей и приватности ({total} акк.)")

    for ph in account_phones:
        if task_engine.is_cancelled(task_id):
            break

        await task_engine.wait_if_paused(task_id)

        clean = ph.strip().lstrip("+")
        client = client_manager.get_client(clean)
        if not client or not client.is_connected():
            await task_engine.update_progress(task_id, log_line=f"[{clean}] ⚠️ Аккаунт не подключен, пропуск")
            continue

        acc_logs = []

        try:
            me = await client.get_me()
            cur_first = me.first_name or ""
            cur_last = me.last_name or ""

            fn = first_name.strip() if (first_name and first_name.strip()) else (cur_first or random.choice(names_pool))
            ln = last_name.strip() if (last_name and last_name.strip()) else (cur_last or (random.choice(surnames_pool) if random.random() < 0.7 else ""))
            
            # 1. Обновление имени, фамилии и "О себе"
            kwargs = {}
            if first_name is not None or not cur_first:
                kwargs["first_name"] = fn
            if last_name is not None or not cur_last:
                kwargs["last_name"] = ln
            if bio is not None:
                kwargs["about"] = process_spintax(bio.strip() if bio.strip() else random.choice(bios_pool))

            if kwargs:
                await client(UpdateProfileRequest(**kwargs))
                acc_logs.append(f"Имя: {fn} {ln}".strip())
                # Обновляем в локальной базе accounts
                await db.execute(
                    "UPDATE accounts SET first_name = ?, last_name = ? WHERE phone = ? OR session_name = ?",
                    (fn, ln, clean, clean)
                )

            # 2. Генерация и установка юзернейма (@username)
            if set_username:
                new_uname = await set_unique_username(client, fn, ln)
                if new_uname:
                    acc_logs.append(f"@{new_uname}")
                    await db.execute(
                        "UPDATE accounts SET username = ? WHERE phone = ? OR session_name = ?",
                        (new_uname, clean, clean)
                    )
                else:
                    acc_logs.append("Юзернейм: занят")

            # 3. Установка случайной аватарки из пула
            if set_avatar and avatar_files:
                try:
                    chosen_avatar = random.choice(avatar_files)
                    file_up = await client.upload_file(str(chosen_avatar))
                    await client(UploadProfilePhotoRequest(file=file_up))
                    acc_logs.append("Аватарка установлена")
                except Exception as av_err:
                    logger.debug(f"Ошибка загрузки фото: {av_err}")

            # 4. Установка 2FA Cloud Password
            if enable_2fa and two_fa_password:
                try:
                    await client.edit_2fa(new_password=two_fa_password.strip(), hint=two_fa_hint or "farm")
                    save_session_2fa(clean, two_fa_password.strip(), two_fa_hint or "farm")
                    acc_logs.append("2FA включен")
                except Exception as fa_err:
                    acc_logs.append("2FA (уже задан)")
                    logger.debug(f"2FA error for {clean}: {fa_err}")

            # 5. Настройки конфиденциальности (Антибан и защита IP)
            if hide_phone:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyPhoneNumber(),
                        rules=[InputPrivacyValueDisallowAll()]
                    ))
                    acc_logs.append("Номер: Никто")
                except Exception:
                    pass

            if hide_search_by_phone:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyAddedByPhone(),
                        rules=[InputPrivacyValueDisallowAll()]
                    ))
                    acc_logs.append("Поиск по номеру: Никто")
                except Exception:
                    pass

            if hide_last_seen:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyStatusTimestamp(),
                        rules=[InputPrivacyValueDisallowAll()]
                    ))
                    acc_logs.append("Время захода: Никто")
                except Exception:
                    pass

            if block_calls:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyPhoneCall(),
                        rules=[InputPrivacyValueDisallowAll()]
                    ))
                    acc_logs.append("Звонки: Никто")
                except Exception:
                    pass

            if block_p2p:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyPhoneP2P(),
                        rules=[InputPrivacyValueDisallowAll()]
                    ))
                    acc_logs.append("P2P: Никто (защита IP)")
                except Exception:
                    pass

            if block_invites:
                try:
                    await client(SetPrivacyRequest(
                        key=InputPrivacyKeyChatInvite(),
                        rules=[InputPrivacyValueAllowContacts()]
                    ))
                    acc_logs.append("Инвайты: Контакты")
                except Exception:
                    pass

            processed += 1
            log_line = f"[{processed}/{total}] [{clean}]: " + (", ".join(acc_logs) if acc_logs else "Готово")
            await task_engine.update_progress(task_id, processed=processed, total=total, log_line=log_line)
            await asyncio.sleep(2.0)

        except Exception as e:
            logger.error(f"Ошибка настройки профиля {clean}: {e}", exc_info=True)
            await task_engine.update_progress(task_id, log_line=f"[{clean}] ❌ Ошибка: {e}")

    status = "completed" if not task_engine.is_cancelled(task_id) else "cancelled"
    await task_engine.update_progress(task_id, status=status, log_line=f"Настройка профилей завершена ({status})")
