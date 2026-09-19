from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from typing import List, Optional
from pydantic import BaseModel
from app.core.security import get_current_admin
from app.services.account_service import (
    get_all_accounts, save_uploaded_session, delete_account,
    bind_proxy_to_account, bind_group_to_account
)
from app.telegram.client_manager import client_manager
from app.db.database import db

router = APIRouter(prefix="/api/accounts", tags=["accounts"], dependencies=[Depends(get_current_admin)])

class PhoneAuthRequest(BaseModel):
    phone: str
    proxy_id: Optional[int] = None

class PhoneCompleteRequest(BaseModel):
    phone: str
    code: str
    password: Optional[str] = None

class BindProxyRequest(BaseModel):
    proxy_id: Optional[int] = None

class BindGroupRequest(BaseModel):
    work_group_id: Optional[int] = None

class WorkGroupCreate(BaseModel):
    title: str
    color: str = "#6366f1"

@router.get("")
async def api_get_accounts():
    return await get_all_accounts()

@router.post("/upload")
async def api_upload_session(
    session_file: UploadFile = File(...),
    json_file: Optional[UploadFile] = File(None)
):
    """Загрузка .session и опционального .json файла."""
    sess_bytes = await session_file.read()
    json_bytes = await json_file.read() if json_file else None
    
    ok, msg = await save_uploaded_session(sess_bytes, session_file.filename, json_bytes)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}

@router.post("/upload-batch")
async def api_upload_batch_sessions(
    files: List[UploadFile] = File(...),
    work_group_id: Optional[int] = Form(None),
    proxy_mode: str = Form("none"),
    proxy_id: Optional[int] = Form(None),
    proxy_group_id: Optional[int] = Form(None),
    accounts_per_proxy: int = Form(1)
):
    """Пакетная загрузка файлов .session, .json и .zip архивов с распределением прокси и групп."""
    import io
    import zipfile
    from pathlib import Path
    from app.services.proxy_service import allocate_proxies_to_accounts

    if not files:
        raise HTTPException(status_code=400, detail="Файлы не выбраны")
        
    sessions_map = {}
    jsons_map = {}
    
    for f in files:
        fn = f.filename or ""
        ext = Path(fn).suffix.lower()
        content = await f.read()

        if ext == ".zip":
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    for zinfo in z.infolist():
                        if zinfo.is_dir():
                            continue
                        zpath = Path(zinfo.filename)
                        zstem = zpath.stem.lower()
                        zext = zpath.suffix.lower()
                        zcontent = z.read(zinfo)
                        if zext == ".session":
                            sessions_map[zstem] = (zpath.name, zcontent)
                        elif zext == ".json":
                            jsons_map[zstem] = zcontent
            except Exception as ze:
                raise HTTPException(status_code=400, detail=f"Ошибка распаковки архива {fn}: {ze}")
        elif ext == ".session":
            stem = Path(fn).stem.lower()
            sessions_map[stem] = (fn, content)
        elif ext == ".json":
            stem = Path(fn).stem.lower()
            jsons_map[stem] = content
            
    if not sessions_map:
        raise HTTPException(status_code=400, detail="Среди загруженных файлов не найдено файлов .session")
        
    session_names = [Path(orig_name).stem for orig_name, _ in sessions_map.values()]

    # 1. Предварительное распределение прокси
    account_proxy_map = {}
    if proxy_mode == "group" and proxy_group_id:
        account_proxy_map = await allocate_proxies_to_accounts(
            account_names=session_names,
            proxy_group_id=proxy_group_id,
            accounts_per_proxy=max(1, int(accounts_per_proxy or 1)),
            work_group_id=work_group_id
        )
    elif proxy_mode == "single" and proxy_id:
        for acc in session_names:
            account_proxy_map[acc] = proxy_id
            if work_group_id is not None:
                await db.execute(
                    "UPDATE accounts SET proxy_id = ?, work_group_id = ? WHERE session_name = ? OR phone = ?",
                    (proxy_id, work_group_id, acc, acc)
                )
            else:
                await db.execute(
                    "UPDATE accounts SET proxy_id = ? WHERE session_name = ? OR phone = ?",
                    (proxy_id, acc, acc)
                )
    elif work_group_id is not None:
        for acc in session_names:
            await db.execute(
                "UPDATE accounts SET work_group_id = ? WHERE session_name = ? OR phone = ?",
                (work_group_id, acc, acc)
            )

    success_count = 0
    errors = []
    
    for stem, (orig_name, sess_bytes) in sessions_map.items():
        base_name = Path(orig_name).stem
        json_bytes = jsons_map.get(stem)
        
        # Привязка прокси и группы перед стартом если определено
        assigned_proxy = account_proxy_map.get(base_name)
        if assigned_proxy is not None or work_group_id is not None:
            existing = await db.fetch_one("SELECT id FROM accounts WHERE session_name = ?", (base_name,))
            if not existing:
                await db.execute(
                    "INSERT INTO accounts (session_name, phone, proxy_id, work_group_id, status) VALUES (?, ?, ?, ?, 'offline')",
                    (base_name, base_name, assigned_proxy, work_group_id)
                )
            else:
                await db.execute(
                    "UPDATE accounts SET proxy_id = COALESCE(?, proxy_id), work_group_id = COALESCE(?, work_group_id) WHERE session_name = ?",
                    (assigned_proxy, work_group_id, base_name)
                )

        ok, msg = await save_uploaded_session(sess_bytes, orig_name, json_bytes)
        if ok:
            success_count += 1
        else:
            errors.append(f"{orig_name}: {msg}")
            
    return {
        "status": "ok",
        "total": len(sessions_map),
        "uploaded": success_count,
        "errors": errors
    }

@router.post("/phone/send-code")
async def api_phone_send_code(req: PhoneAuthRequest):
    ok, msg, data = await client_manager.start_phone_auth(req.phone, req.proxy_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "data": data}

@router.post("/phone/sign-in")
async def api_phone_sign_in(req: PhoneCompleteRequest):
    ok, msg, data = await client_manager.complete_phone_auth(req.phone, req.code, req.password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg, "data": data}

@router.post("/{name}/start")
async def api_start_account(name: str):
    ok, msg = await client_manager.start_account(name)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}

@router.post("/{name}/bind-proxy")
async def api_bind_proxy(name: str, req: BindProxyRequest):
    await bind_proxy_to_account(name, req.proxy_id)
    return {"status": "ok"}

@router.post("/{name}/bind-group")
async def api_bind_group(name: str, req: BindGroupRequest):
    await bind_group_to_account(name, req.work_group_id)
    return {"status": "ok"}

@router.delete("/{name}")
async def api_delete_account(name: str):
    await delete_account(name)
    return {"status": "ok"}

# Рабочие группы
@router.get("/groups")
async def api_get_groups():
    return await db.fetch_all("SELECT * FROM work_groups ORDER BY id ASC")

@router.post("/groups")
async def api_create_group(req: WorkGroupCreate):
    import time
    now = int(time.time())
    g_id = await db.execute("INSERT INTO work_groups (title, color, created_at) VALUES (?, ?, ?)", (req.title.strip(), req.color, now))
    return {"id": g_id, "title": req.title, "color": req.color}

@router.delete("/groups/{group_id}")
async def api_delete_group(group_id: int):
    await db.execute("UPDATE accounts SET work_group_id = NULL WHERE work_group_id = ?", (group_id,))
    await db.execute("DELETE FROM work_groups WHERE id = ?", (group_id,))
    return {"status": "ok"}

import re

@router.get("/{session_name}/telegram_code")
async def get_telegram_service_code(session_name: str):
    """Получает последний код подтверждения входа от официального Telegram (чат 777000)."""
    clean = session_name.strip().lstrip("+")
    client = client_manager.get_client(clean)
    if not client or not client.is_connected():
        raise HTTPException(status_code=404, detail=f"Аккаунт {session_name} не подключен к сети")

    try:
        found_code = None
        message_text = None
        message_date = None

        async for msg in client.iter_messages(777000, limit=5):
            text = msg.text or ""
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
            return {"success": True, "account": session_name, "code": found_code, "text": message_text, "date": message_date}
        elif message_text:
            return {"success": True, "account": session_name, "code": None, "text": message_text, "date": message_date}
        else:
            return {"success": False, "account": session_name, "message": "В сервисном чате 777000 пока нет сообщений"}
    except Exception as e:
        return {"success": False, "account": session_name, "message": str(e)}
