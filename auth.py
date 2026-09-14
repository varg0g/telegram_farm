import os
import re
import time
import json
import aiosqlite
import hashlib
import secrets
from render import code_form, error_page, password_form, login_page
from typing import List, Optional
from pathlib import Path
from html import escape
from database import get_db
from utils import ( 
    BASE_DIR, SESSIONS_DIR, check_rate_limit, verify_csrf, get_current_user, 
    DELIVERY_NAMES, clients, clients_lock, ADMIN_PASSWORD_HASH, 
    SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, pending_clients, INDEX_HTML, 
    make_client, API_ID, API_HASH, _upsert_account, _account_record, get_random_profile,
    delete_session_files, _get_client, start_single_client, clients_dict
)
from session_guard import (
    detect_and_migrate_session, freeze_device_profile,
    extract_session_archive, read_device_fingerprint, safe_quarantine_session
)
from logger import logger
from fastapi import Request, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi import APIRouter

auth_router = APIRouter()

ALLOWED_UPLOAD_EXTS = {".session", ".json", ".zip"}

@auth_router.post("/upload_session/", dependencies=[Depends(get_current_user)])
async def upload_session(
    request: Request,
    files: List[UploadFile] = File(...),
    work_group_id: Optional[str] = Form(None),
    proxy_mode: str = Form("none"),
    proxy_id: Optional[str] = Form(None),
    proxy_group_id: Optional[str] = Form(None),
    accounts_per_proxy: int = Form(1)
):
    await check_rate_limit(request)
    verify_csrf(request)

    target_wg_id = int(str(work_group_id).strip()) if work_group_id and str(work_group_id).strip().isdigit() else None
    target_proxy_id = int(str(proxy_id).strip()) if proxy_id and str(proxy_id).strip().isdigit() else None
    target_pg_id = int(str(proxy_group_id).strip()) if proxy_group_id and str(proxy_group_id).strip().isdigit() else None
    accs_per_proxy = max(1, int(accounts_per_proxy or 1))

    saved_count = 0
    sessions_to_start = set()

    for file in files:
        raw_name = Path(file.filename).name
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', raw_name)
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in ALLOWED_UPLOAD_EXTS:
            raise HTTPException(400, f"Недопустимое расширение файла: {safe_name}. Разрешены: .session, .json, .zip")

        content = await file.read()

        if ext == ".zip":
            # Извлекаем все .session и .json из архива
            extracted_names = extract_session_archive(content, SESSIONS_DIR)
            sessions_to_start.update(extracted_names)
            saved_count += len(extracted_names)
        else:
            target_path = SESSIONS_DIR / safe_name
            with open(target_path, "wb") as new_file:
                new_file.write(content)
            saved_count += 1
            if ext == ".session":
                sessions_to_start.add(safe_name[:-len(".session")])

    # Если загружен только .json, а .session уже лежал в папке
    for file in files:
        raw_name = Path(file.filename).name
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', raw_name)
        if safe_name.endswith(".json"):
            acc_base = safe_name[:-len(".json")]
            if (SESSIONS_DIR / f"{acc_base}.session").exists():
                sessions_to_start.add(acc_base)

    # 1. Предварительное распределение прокси ДО запуска сессий
    account_proxy_map = {}
    from utils import allocate_proxies_to_accounts

    if proxy_mode == "group" and target_pg_id:
        account_proxy_map = await allocate_proxies_to_accounts(
            account_names=list(sessions_to_start),
            proxy_group_id=target_pg_id,
            accounts_per_proxy=accs_per_proxy,
            work_group_id=target_wg_id
        )
    elif proxy_mode == "single" and target_proxy_id:
        for acc in sessions_to_start:
            account_proxy_map[acc] = target_proxy_id
    elif target_wg_id:
        async with get_db() as db:
            for acc in sessions_to_start:
                await db.execute(
                    "INSERT INTO accounts (name, work_group_id) VALUES (?, ?) "
                    "ON CONFLICT(name) DO UPDATE SET work_group_id = excluded.work_group_id",
                    (acc, target_wg_id)
                )
            await db.commit()

    # 2. "Горячий" запуск сессий прямо на лету с уже привязанным прокси и группой!
    started_accounts = []
    failed_accounts = []

    for acc_name in sorted(list(sessions_to_start)):
        assigned_p_id = account_proxy_map.get(acc_name, target_proxy_id if proxy_mode == "single" else None)
        try:
            ok, client, msg = await start_single_client(
                acc_name, 
                proxy_id=assigned_p_id,
                work_group_id=target_wg_id
            )
            if ok:
                started_accounts.append(acc_name)
            else:
                failed_accounts.append({"account": acc_name, "error": msg})
        except Exception as e:
            failed_accounts.append({"account": acc_name, "error": str(e)})

    msg = f"Файлов обработано: {saved_count}. Запущено сессий: {len(started_accounts)}."
    if failed_accounts:
        msg += f" Ошибок: {len(failed_accounts)}."

    return {
        "success": True,
        "message": msg,
        "started": started_accounts,
        "failed": failed_accounts
    }

def normalize_phone(raw: str) -> str:
    digits = re.sub(r"[^\d]", "", raw)
    return "+" + digits if digits else ""

def session_name(phone_number: str) -> str:
    return re.sub(r"\D", "", phone_number)

@auth_router.get("/login", response_class=HTMLResponse)
async def get_login_page(request: Request):
    if not ADMIN_PASSWORD_HASH:
        return RedirectResponse(url="/", status_code=303)
    session = request.cookies.get(SESSION_COOKIE_NAME)
    expected = hashlib.sha256((ADMIN_PASSWORD_HASH + "tf_salt").encode()).hexdigest()
    if session and session == expected:
        return RedirectResponse(url="/", status_code=303)
    return login_page()

@auth_router.post("/login")
async def do_login(request: Request, password: str = Form(...)):
    await check_rate_limit(request, max_req=10, window=60)
    input_hash = hashlib.sha256(password.encode()).hexdigest()
    if input_hash != ADMIN_PASSWORD_HASH:
        return login_page("Неверный пароль")

    session_val = hashlib.sha256((ADMIN_PASSWORD_HASH + "tf_salt").encode()).hexdigest()
    csrf_val = secrets.token_hex(16)

    response = RedirectResponse(url="/", status_code=303)
    response.set_cookie(SESSION_COOKIE_NAME, session_val, httponly=True)
    response.set_cookie(CSRF_COOKIE_NAME, csrf_val, httponly=False)
    return response

@auth_router.post("/logout")
async def do_logout(request: Request):
    response = RedirectResponse(url="/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE_NAME)
    response.delete_cookie(CSRF_COOKIE_NAME)
    return response

@auth_router.post("/send_code")
async def send_code(
    request: Request,
    phone_number: str = Form(...),
    proxy_id: Optional[int] = Form(None),
    proxy_group_id: Optional[int] = Form(None)
):
    await check_rate_limit(request)
    phone_number = normalize_phone(phone_number)
    if not re.fullmatch(r"\+\d{7,15}", phone_number):
        return error_page("Номер должен быть в международном формате, например +79991234567.")

    previous = pending_clients.pop(phone_number, None)
    if previous and previous["client"].is_connected:
        try:
            await previous["client"].disconnect()
        except Exception:
            pass

    async with clients_lock:
        existing = next((c for c in clients if c.name == session_name(phone_number)), None)

    if existing is not None:
        try:
            if not existing.is_connected:
                await existing.connect()
                await existing.initialize()
        except Exception as error:
            return error_page(f"Не удалось подключиться к сессии: {escape(str(error))}", status_code=502)
        return RedirectResponse(url=f"/?account={existing.name}", status_code=303)

    # === ДОСТАЕМ ПРОКСИ ИЗ БАЗЫ ===
    proxy_dict = None
    target_proxy_id = proxy_id
    if not target_proxy_id and proxy_group_id:
        async with get_db() as db:
            cursor = await db.execute("""
                SELECT p.id FROM proxies p
                WHERE p.proxy_group_id = ?
                ORDER BY (SELECT COUNT(*) FROM accounts WHERE proxy_id = p.id) ASC, p.id ASC
                LIMIT 1
            """, (proxy_group_id,))
            p_row = await cursor.fetchone()
            if p_row:
                target_proxy_id = p_row[0]

    if target_proxy_id: 
        async with get_db() as db:
            cursor = await db.execute("SELECT host, port, username, password FROM proxies WHERE id = ?", (target_proxy_id,))
            row = await cursor.fetchone()
            if row:
                proxy_dict = {
                    "scheme": "socks5",
                    "hostname": row[0],
                    "port": row[1],
                    "username": row[2] or "",
                    "password": row[3] or ""
                }

    profile = get_random_profile()
    
    # --- ЗАПЛАТКА ДЛЯ РЕАЛИСТИЧНОГО УСТРОЙСТВА ---
    # Убираем палевное слово "Desktop" из версии приложения
    if "Desktop" in profile.get("app_version", ""):
        profile["app_version"] = profile["app_version"].replace("Telegram Desktop", "Telegram iOS")
    # Если устройство Android, то лучше написать "Telegram Android"
    if "Android" in profile.get("system_version", "") or "Samsung" in profile.get("device_model", ""):
        profile["app_version"] = profile["app_version"].replace("Telegram iOS", "Telegram Android")

    new_client = make_client(
            session_name(phone_number), 
            profile["api_id"], 
            profile["api_hash"],
            device_model=profile["device_model"],
            system_version=profile["system_version"],
            app_version=profile["app_version"],
            lang_code=profile["lang_code"],
            system_lang_code=profile["system_lang_code"],
            proxy=proxy_dict  # <--- Передаем наш прокси прямо в Pyrogram!
        )

    try:
        is_authorized = await new_client.connect()
    except Exception as error:
        if type(error).__name__ == "AuthKeyUnregistered":
            try:
                new_client.storage.close()
            except Exception:
                pass
            delete_session_files(new_client.name)
            return error_page("Старая сессия (ключ) была недействительна и удалена. Пожалуйста, попробуйте войти еще раз.")
        return error_page(f"Не удалось подключиться к Telegram: {escape(str(error))}", status_code=502)

    if is_authorized:
        await new_client.initialize()
        async with clients_lock:
            clients.append(new_client)
        clients_dict[new_client.name] = new_client
        _upsert_account(await _account_record(new_client))
        return RedirectResponse(url=f"/?account={new_client.name}", status_code=303)

    try:
        sent_code_info = await new_client.send_code(phone_number)
    except Exception as error:
        name = type(error).__name__
        error_id = getattr(error, "ID", "") or name
        await new_client.disconnect()
        
        if name == "AuthKeyUnregistered":
            try:
                new_client.storage.close()
            except Exception:
                pass
            delete_session_files(new_client.name)
            return error_page("Старая сессия (ключ) была недействительна и удалена. Пожалуйста, попробуйте войти еще раз.")
            
        if name == "PhoneNumberInvalid":
            return error_page("Telegram считает номер некорректным. Проверьте код страны и цифры.")
        if name == "FloodWait":
            return error_page(f"Telegram ограничил запросы — подождите {getattr(error, 'value', 60)} сек.", status_code=429)
        if error_id == "SEND_CODE_UNAVAILABLE":
            return error_page(
                "Telegram отказался отправить код (SEND_CODE_UNAVAILABLE). Обычно это значит: "
                "на этот номер нет активной сессии в официальном приложении Telegram, а SMS-коды "
                "сторонним приложениям Telegram не отправляет с 18.02.2023. Войдите в этот номер "
                "в официальном приложении и попробуйте снова.",
            )
        return error_page(f"Telegram не отправил код: {escape(str(error))}", status_code=502)

    logger.info(f"Код отправлен на {phone_number}. Способ: {sent_code_info.type.name}")

    pending_clients[phone_number] = {
        "client": new_client,
        "phone_code_hash": sent_code_info.phone_code_hash,
        "sent_code": sent_code_info,
        "resend_at": time.monotonic() + (sent_code_info.timeout or 0),
        "created_at": time.monotonic(),
        "proxy_id": target_proxy_id,
        "profile": profile,
    }
    print(
        f"Код для {phone_number}: type={sent_code_info.type.name}, "
        f"next_type={sent_code_info.next_type.name if sent_code_info.next_type else None}, "
        f"timeout={sent_code_info.timeout}"
    )
    return code_form(phone_number, sent_code_info)

@auth_router.post("/resend_code")
async def resend_code(request: Request, phone_number: str = Form(...)):
    await check_rate_limit(request)
    phone_number = normalize_phone(phone_number)
    auth_data = pending_clients.get(phone_number)
    if not auth_data:
        return error_page("Запрос кода не найден. Запросите код заново.")
    sent_code = auth_data["sent_code"]
    seconds_left = int(auth_data["resend_at"] - time.monotonic())
    if seconds_left > 0:
        return code_form(phone_number, sent_code, f"Повторную отправку можно сделать через {seconds_left} сек.")

    try:
        resent_code = await auth_data["client"].resend_code(phone_number, auth_data["phone_code_hash"])
    except Exception as error:
        error_id = getattr(error, "ID", "") or type(error).__name__
        if error_id == "SEND_CODE_UNAVAILABLE":
            return code_form(
                phone_number, sent_code,
                "Telegram отказался повторить отправку (SEND_CODE_UNAVAILABLE): на этот номер нет "
                "активной сессии в официальном приложении Telegram, а SMS-коды сторонним приложениям "
                "Telegram не отправляет с 18.02.2023. Войдите в номер в официальном приложении.",
            )
        return code_form(phone_number, sent_code, f"Не удалось повторно отправить: {escape(str(error))}")

    auth_data["phone_code_hash"] = resent_code.phone_code_hash
    auth_data["sent_code"] = resent_code
    auth_data["resend_at"] = time.monotonic() + (resent_code.timeout or 0)
    return code_form(phone_number, resent_code, "Телеграм принял повторный запрос. Проверьте способ доставки.")

@auth_router.post("/sign_in")
async def sign_in(request: Request, phone_number: str = Form(...), phone_code: str = Form(...)):
    await check_rate_limit(request)
    phone_number = normalize_phone(phone_number)
    auth_data = pending_clients.get(phone_number)
    if not auth_data:
        return error_page("Запрос кода не найден или сервер был перезапущен. Запросите новый код.")

    client = auth_data["client"]
    proxy_id = auth_data.get("proxy_id")  # <--- Добавляем вот эту строчку!

    phone_code = re.sub(r"\D", "", phone_code)

    try:
        await client.sign_in(phone_number, auth_data["phone_code_hash"], phone_code)
    except Exception as error:
        name = type(error).__name__
        if name == "SessionPasswordNeeded":
            return password_form(phone_number)
        if name == "PhoneCodeInvalid":
            return error_page("Неверный код. Введите актуальный код из Telegram.")
        if name == "PhoneCodeExpired":
            await client.disconnect()
            pending_clients.pop(phone_number, None)
            return error_page("Срок действия кода истёк. Запросите новый код.")
        if name == "PhoneNumberUnoccupied":
            return error_page(
                "Этот номер ещё не зарегистрирован в Telegram. Сначала создайте аккаунт в официальном приложении."
            )
        return error_page(f"Не удалось войти: {escape(str(error))}")

    await client.storage.save()
    await client.initialize()
    pending_clients.pop(phone_number, None)

    # Замораживаем профиль устройства навсегда в {phone}.json!
    profile = auth_data.get("profile") or get_random_profile()
    freeze_device_profile(
        session_name=client.name,
        profile_data=profile,
        phone=phone_number,
        proxy_dict=client.proxy
    )

    async with clients_lock:
        if not any(c.name == client.name for c in clients):
            clients.append(client)
    clients_dict[client.name] = client
    _upsert_account(await _account_record(client))
    print(f"Аккаунт {client.name} авторизован!")

    # === СОХРАНЯЕМ АККАУНТ В БАЗУ ДАННЫХ ===
    async with get_db() as db:
        await db.execute(
            "INSERT INTO accounts (name, phone, proxy_id, device_fingerprint) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(name) DO UPDATE SET phone = excluded.phone, proxy_id = COALESCE(excluded.proxy_id, accounts.proxy_id), device_fingerprint = excluded.device_fingerprint",
            (client.name, phone_number, proxy_id, json.dumps(profile, ensure_ascii=False))
        )
        await db.commit()
    return RedirectResponse(url=f"/?account={client.name}", status_code=303)

@auth_router.post("/check_password")
async def check_password(request: Request, phone_number: str = Form(...), password: str = Form(...)):
    await check_rate_limit(request)
    phone_number = normalize_phone(phone_number)
    auth_data = pending_clients.get(phone_number)
    if not auth_data:
        return error_page("Попытка входа не найдена. Запросите код заново.")

    client = auth_data["client"]
    proxy_id = auth_data.get("proxy_id")
    try:
        await client.check_password(password)
    except Exception as error:
        name = type(error).__name__
        if name in ("PasswordHashInvalid", "PasswordEmpty"):
            return password_form(phone_number, "Неверный пароль. Попробуйте еще раз.")
        
        # Если ошибка другая (например, исчерпан лимит попыток), сбрасываем авторизацию
        await client.disconnect()
        pending_clients.pop(phone_number, None)
        return error_page(f"Не удалось проверить пароль: {escape(str(error))}")

    await client.storage.save()
    await client.initialize()
    pending_clients.pop(phone_number, None)

    # Замораживаем профиль устройства И пароль 2FA в {phone}.json!
    profile = auth_data.get("profile") or get_random_profile()
    freeze_device_profile(
        session_name=client.name,
        profile_data=profile,
        phone=phone_number,
        proxy_dict=client.proxy,
        two_fa=password
    )

    async with clients_lock:
        if not any(c.name == client.name for c in clients):
            clients.append(client)
    clients_dict[client.name] = client
    _upsert_account(await _account_record(client))
    print(f"Аккаунт {client.name} авторизован!")

    # === СОХРАНЯЕМ АККАУНТ В БАЗУ ДАННЫХ ===
    async with get_db() as db:
        await db.execute(
            "INSERT INTO accounts (name, phone, proxy_id, device_fingerprint) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(name) DO UPDATE SET phone = excluded.phone, proxy_id = COALESCE(excluded.proxy_id, accounts.proxy_id), device_fingerprint = excluded.device_fingerprint",
            (client.name, phone_number, proxy_id, json.dumps(profile, ensure_ascii=False))
        )
        await db.commit()
    return RedirectResponse(url=f"/?account={client.name}", status_code=303)

@auth_router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    if ADMIN_PASSWORD_HASH:
        session = request.cookies.get(SESSION_COOKIE_NAME)
        expected = hashlib.sha256((ADMIN_PASSWORD_HASH + "tf_salt").encode()).hexdigest()
        if not session or session != expected:
            return RedirectResponse(url="/login", status_code=303)

    html_path = BASE_DIR / "index.html"
    if html_path.exists():
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        content = INDEX_HTML
    response = HTMLResponse(content)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    if CSRF_COOKIE_NAME not in request.cookies:
        csrf_token = secrets.token_hex(16)
        response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False)
    return response


@auth_router.get("/api/accounts/{account_name}/telegram_code", dependencies=[Depends(get_current_user)])
async def get_telegram_service_code(request: Request, account_name: str):
    """Получает последний код подтверждения входа от официального Telegram (чат 777000)"""
    await check_rate_limit(request)
    client = await _get_client(account_name)
    if not client or not getattr(client, "is_connected", False):
        raise HTTPException(404, f"Аккаунт {account_name} не найден или не подключен к сети")

    try:
        # Проверяем историю сервисного чата 777000 (Telegram Notifications)
        found_code = None
        message_text = None
        message_date = None

        async for msg in client.get_chat_history(777000, limit=5):
            text = msg.text or getattr(msg, "caption", "") or ""
            # Ищем 5-значный или 6-значный код в тексте сообщения
            match = re.search(r'\b(\d{5,6})\b', text)
            if match:
                found_code = match.group(1)
                message_text = text
                message_date = msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else ""
                break
            elif not message_text and text:
                message_text = text
                message_date = msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else ""

        if found_code:
            return {
                "success": True,
                "account": account_name,
                "code": found_code,
                "text": message_text,
                "date": message_date
            }
        elif message_text:
            return {
                "success": True,
                "account": account_name,
                "code": None,
                "text": message_text,
                "date": message_date,
                "note": "Код в сообщении не обнаружен, показан текст последнего сообщения"
            }
        else:
            return {
                "success": False,
                "account": account_name,
                "message": "В сервисном чате Telegram 777000 пока нет сообщений"
            }
    except Exception as e:
        logger.warning(f"Не удалось получить сервисный код для {account_name}: {e}")
        return {
            "success": False,
            "account": account_name,
            "message": f"Не удалось прочитать сообщения чата 777000: {e}"
        }

