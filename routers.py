from fastapi import APIRouter
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Response, Request, Cookie, HTTPException, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse, FileResponse
from utils import ( get_current_user, check_rate_limit, accounts_cache, verify_csrf, 
                   BASE_DIR, SESSIONS_DIR, clients, clients_lock, dialog_caches, 
                   dialog_locks, _get_client, parse_proxy_string, format_raw_user_status,
                   clients_dict, account_errors
)
from logger import logger
from database import get_db
from task_manager import task_manager
from pathlib import Path
import io
import mimetypes
import asyncio
import os
import time
import uuid
import re
import aiosqlite
import tl_patch

router = APIRouter()

from fastapi import WebSocket, WebSocketDisconnect
from utils import manager

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # client can send pings, we ignore
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@router.get("/api/accounts", dependencies=[Depends(get_current_user)])
async def api_accounts(request: Request):
    await check_rate_limit(request, max_req=1200, scope="read")
    
    # Достаем данные аккаунтов из локальной базы данных
    async with get_db() as db:
        cursor = await db.execute("SELECT name, work_group_id, proxy_id, phone FROM accounts")
        db_accounts = await cursor.fetchall()
        group_map = {row[0]: row[1] for row in db_accounts}
        proxy_map = {row[0]: row[2] for row in db_accounts}
        phone_map = {row[0]: row[3] for row in db_accounts}
        db_account_names = set(row[0] for row in db_accounts)

    session_files = set(f[:-len(".session")] for f in os.listdir(SESSIONS_DIR) if f.endswith(".session"))
    all_account_names = session_files.union(db_account_names)

    # 1. Активные подключенные аккаунты
    enriched_accounts = []
    active_names = set()
    seen_identifiers = set()
    for acc in accounts_cache:
        acc_copy = dict(acc)
        acc_name = acc["name"]
        ident = acc.get("phone") or acc.get("id") or acc_name
        if ident in seen_identifiers:
            continue
        seen_identifiers.add(ident)
        active_names.add(acc_name)
        acc_copy["work_group_id"] = group_map.get(acc_name)
        acc_copy["proxy_id"] = proxy_map.get(acc_name)
        acc_copy["status"] = "active"
        enriched_accounts.append(acc_copy)

    # 2. Неактивные / с ошибкой / замороженные сессии проекта
    for name in sorted(all_account_names):
        if name.startswith("copy_") or name.startswith("test_"):
            continue
        if name not in active_names:
            phone_val = phone_map.get(name, "")
            if phone_val and phone_val in seen_identifiers:
                continue
            if phone_val:
                seen_identifiers.add(phone_val)
            err = account_errors.get(name)
            sess_path = SESSIONS_DIR / f"{name}.session"
            if not sess_path.exists():
                status = "quarantined"
                err = err or "Сессия в карантине (отозвана/заморожена)"
            else:
                status = "error" if err else "connecting"
                err = err or "Запуск сессии..."
            
            enriched_accounts.append({
                "name": name,
                "id": 0,
                "first": name,
                "last": "",
                "username": "",
                "phone": phone_map.get(name, ""),
                "work_group_id": group_map.get(name),
                "proxy_id": proxy_map.get(name),
                "status": status,
                "error": err
            })

    total_count = len(all_account_names)
    active_count = len(active_names)

    return {
        "accounts": enriched_accounts,
        "count": len(enriched_accounts),
        "total_count": total_count,
        "active_count": active_count
    }

@router.post("/api/send_message", dependencies=[Depends(get_current_user)])
async def api_send_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_text: str = Form(...),
    reply_to_message_id: Optional[int] = Form(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        kwargs = {"chat_id": chat_id, "text": message_text}
        if reply_to_message_id:
            kwargs["reply_to_message_id"] = reply_to_message_id
        msg = await client.send_message(**kwargs)
        from pyrogram.raw.functions.account import UpdateStatus
        try:
            await client.invoke(UpdateStatus(offline=False))
        except:
            pass
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True, "id": msg.id})


@router.post("/api/delete_message", dependencies=[Depends(get_current_user)])
async def api_delete_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_ids: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        ids = [int(i.strip()) for i in message_ids.split(",") if i.strip().isdigit()]
        if not ids:
            return JSONResponse({"ok": False, "error": "Нет ID для удаления"}, status_code=400)
        await client.delete_messages(chat_id=chat_id, message_ids=ids)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True})

@router.post("/api/edit_message", dependencies=[Depends(get_current_user)])
async def api_edit_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...),
    message_text: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        msg = await client.edit_message_text(chat_id=chat_id, message_id=message_id, text=message_text)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True})

@router.post("/api/forward_messages", dependencies=[Depends(get_current_user)])
async def api_forward_messages(
    request: Request,
    account: str = Form(...),
    from_chat_id: int = Form(...),
    to_chat_id: int = Form(...),
    message_ids: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        ids = [int(i.strip()) for i in message_ids.split(",") if i.strip().isdigit()]
        if not ids:
            return JSONResponse({"ok": False, "error": "Нет ID для пересылки"}, status_code=400)
        await client.forward_messages(chat_id=to_chat_id, from_chat_id=from_chat_id, message_ids=ids)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True})



@router.get("/api/debug_caches")
async def debug_caches():
    res = {}
    for k, v in dialog_caches.items():
        res[k] = len(v.get("items", []))
    return JSONResponse(res)

@router.post("/api/send_sticker", dependencies=[Depends(get_current_user)])
async def api_send_sticker(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    file_id: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        await client.send_sticker(chat_id=chat_id, sticker=file_id)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True})

@router.post("/api/react_message", dependencies=[Depends(get_current_user)])
async def api_react_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...),
    emoji: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        await client.send_reaction(chat_id=chat_id, message_id=message_id, emoji=emoji)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True})

@router.post("/api/bot_callback", dependencies=[Depends(get_current_user)])
async def api_bot_callback(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...),
    callback_data: str = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        from urllib.parse import unquote
        cb_val = unquote(callback_data)
        res = await client.request_callback_answer(
            chat_id=chat_id,
            message_id=message_id,
            callback_data=cb_val
        )
        return JSONResponse({
            "ok": True,
            "message": getattr(res, "message", None),
            "alert": bool(getattr(res, "alert", False)),
            "url": getattr(res, "url", None)
        })
    except Exception as error:
        logger.warning(f"Bot callback error for {account} in {chat_id}: {error}")
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)


class _NamedBytesIO(io.BytesIO):
    """BytesIO с атрибутом .name — pyrogram использует его для определения MIME."""

    def __init__(self, data, name):
        super().__init__(data)
        self.name = name

@router.post("/api/pin_message")
async def api_pin_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...)
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        await client.pin_chat_message(chat_id, message_id)
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"error": str(e)})

@router.post("/api/unpin_message")
async def api_unpin_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...)
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        await client.unpin_chat_message(chat_id, message_id)
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"error": str(e)})

from pyrogram.raw.functions.account import UpdateNotifySettings
from pyrogram.raw.types import InputNotifyPeer, InputPeerNotifySettings

@router.post("/api/mute_chat")
async def api_mute_chat(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    until_date: int = Form(0) # 0 means forever, timestamp for until
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        peer = await client.resolve_peer(chat_id)
        await client.invoke(
            UpdateNotifySettings(
                peer=InputNotifyPeer(peer=peer),
                settings=InputPeerNotifySettings(mute_until=until_date)
            )
        )
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"error": str(e)})


@router.post("/api/search_chat")
async def api_search_chat(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    query: str = Form(...),
    limit: int = Form(50)
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        
        messages = []
        async for msg in client.search_messages(chat_id, query=query, limit=limit):
            messages.append({
                "id": msg.id,
                "text": msg.text or msg.caption or "",
                "date": msg.date.timestamp() if msg.date else 0,
                "sender_id": msg.from_user.id if msg.from_user else None
            })
            
        return JSONResponse({"ok": True, "messages": messages})
    except Exception as e:
        return JSONResponse({"error": str(e)})


@router.post("/api/search_gifs")
async def api_search_gifs(
    request: Request,
    account: str = Form(...),
    query: str = Form("smile")
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        
        results = await client.get_inline_bot_results("gif", query)
        gifs = []
        for r in results.results[:20]:
            gifs.append({
                "id": r.id,
                "query_id": str(results.query_id),
                "thumb": r.thumb.url if r.thumb else None,
                "url": r.content.url if r.content else None
            })
        return JSONResponse({"ok": True, "gifs": gifs})
    except Exception as e:
        return JSONResponse({"error": str(e)})

@router.post("/api/send_inline_result")
async def api_send_inline_result(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    query_id: str = Form(...),
    result_id: str = Form(...)
):
    try:
        client = await _get_client(account)
        if not client: return JSONResponse({'error': 'Аккаунт не найден'})
        await client.send_inline_bot_result(chat_id, int(query_id), result_id)
        return JSONResponse({"ok": True})
    except Exception as e:
        return JSONResponse({"error": str(e)})

@router.post("/api/read_history", dependencies=[Depends(get_current_user)])
async def api_read_history(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)

    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)

    try:
        # Отправляем сигнал в Telegram о прочтении диалога
        await client.read_chat_history(chat_id)
        from pyrogram.raw.functions.account import UpdateStatus
        try:
            await client.invoke(UpdateStatus(offline=False))
        except:
            pass

        # Update backend dialog cache
        from main import dialog_caches
        cache = dialog_caches.get(account)
        if cache and cache.get("items"):
            for item in cache["items"]:
                if item["id"] == chat_id:
                    item["unread"] = 0
                    break

        
        # Помечаем это сообщение прочитанным в БД
        async with get_db() as db:
            await db.execute(
                "UPDATE messages SET is_read = 1 WHERE account = ? AND chat_id = ?",
                (account, chat_id)
            )
            await db.commit()

    except Exception as error:
        logger.exception(f"Error in api_read_history for {account}")
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)

    return JSONResponse({"ok": True})        

@router.post("/api/chat_action", dependencies=[Depends(get_current_user)])
async def api_chat_action(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    action: str = Form(...)
):
    await check_rate_limit(request, max_req=300, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    from pyrogram.enums import ChatAction
    action_map = {
        "typing": ChatAction.TYPING,
        "record_audio": ChatAction.RECORD_AUDIO,
        "record_video_note": ChatAction.RECORD_VIDEO_NOTE,
        "upload_photo": ChatAction.UPLOAD_PHOTO,
        "upload_video": ChatAction.UPLOAD_VIDEO,
        "choose_sticker": ChatAction.CHOOSE_STICKER,
        "cancel": ChatAction.CANCEL,
    }
    target_action = action_map.get(action, ChatAction.TYPING)
    try:
        await client.send_chat_action(chat_id, target_action)
    except Exception as e:
        logger.debug(f"Chat action failed for {account} in {chat_id}: {e}")
    return JSONResponse({"ok": True})


@router.post("/api/read_media_content", dependencies=[Depends(get_current_user)])
async def api_read_media_content(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...)
):
    await check_rate_limit(request, max_req=300, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        from pyrogram.raw.functions.messages import ReadMessageContents
        await client.invoke(ReadMessageContents(id=[message_id]))
    except Exception as e:
        logger.debug(f"ReadMessageContents failed: {e}")
    return JSONResponse({"ok": True})


@router.get("/api/chat/pinned_message", dependencies=[Depends(get_current_user)])
async def api_get_pinned_message(
    request: Request,
    account: str,
    chat_id: int
):
    await check_rate_limit(request, max_req=1200, scope="read")
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    try:
        chat = await client.get_chat(chat_id)
        pm = getattr(chat, "pinned_message", None)
        if pm:
            from render import _media_label
            text = pm.text if pm.text else _media_label(pm)
            sender_name = "Закрепленное сообщение"
            if getattr(pm, "from_user", None):
                u = pm.from_user
                sender_name = (" ".join(filter(None, [u.first_name, u.last_name])) or u.first_name or "Пользователь")
            elif getattr(pm, "chat", None) and getattr(pm.chat, "title", None):
                sender_name = pm.chat.title
            return JSONResponse({
                "ok": True,
                "has_pinned": True,
                "id": pm.id,
                "text": text[:150] if text else "Закрепленное сообщение",
                "sender_name": sender_name
            })
        return JSONResponse({"ok": True, "has_pinned": False})
    except Exception as e:
        logger.debug(f"Failed to fetch pinned message: {e}")
        return JSONResponse({"ok": True, "has_pinned": False})


@router.post("/api/send_voice", dependencies=[Depends(get_current_user)])
async def api_send_voice(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    voice: UploadFile = File(...),
    reply_to_message_id: Optional[int] = Form(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)

    # 👇 Вставляем наш фикс прямо сюда:
    if client.me is None:
        client.me = await client.get_me()

    data = await voice.read()
    if not data:
        return JSONResponse({"ok": False, "error": "Пустая запись"}, status_code=400)
    try:
        kwargs = {"chat_id": chat_id, "voice": _NamedBytesIO(data, "voice.ogg")}
        if reply_to_message_id:
            kwargs["reply_to_message_id"] = reply_to_message_id
        msg = await client.send_voice(**kwargs)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True, "id": msg.id})

@router.post("/api/send_video_note", dependencies=[Depends(get_current_user)])
async def api_send_video_note(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    video_note: UploadFile = File(...),
    duration: Optional[int] = Form(0),
    reply_to_message_id: Optional[int] = Form(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    if client.me is None:
        client.me = await client.get_me()

    data = await video_note.read()
    if not data:
        return JSONResponse({"ok": False, "error": "Пустая видеозапись"}, status_code=400)
    try:
        kwargs = {"chat_id": chat_id, "video_note": _NamedBytesIO(data, "video_note.mp4")}
        if duration:
            kwargs["duration"] = duration
        if reply_to_message_id:
            kwargs["reply_to_message_id"] = reply_to_message_id
        msg = await client.send_video_note(**kwargs)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True, "id": msg.id})

@router.post("/api/send_document", dependencies=[Depends(get_current_user)])
async def api_send_document(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    reply_to_message_id: Optional[int] = Form(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    data = await file.read()
    if not data:
        return JSONResponse({"ok": False, "error": "Пустой файл"}, status_code=400)

    fname = file.filename or "file.dat"
    named_file = _NamedBytesIO(data, fname)
    mime = file.content_type or mimetypes.guess_type(fname)[0] or ""

    try:
        kwargs = {"chat_id": chat_id, "caption": caption}
        if reply_to_message_id:
            kwargs["reply_to_message_id"] = reply_to_message_id

        if mime.startswith("image/") and not mime.endswith("gif"):
            msg = await client.send_photo(photo=named_file, **kwargs)
        else:
            msg = await client.send_document(document=named_file, **kwargs)
    except Exception as error:
        return JSONResponse({"ok": False, "error": str(error)}, status_code=502)
    return JSONResponse({"ok": True, "id": msg.id})

@router.post("/api/delete_account", dependencies=[Depends(get_current_user)])
async def api_delete_account(request: Request, account: str = Form(...)):
    await check_rate_limit(request, max_req=30, scope="auth")
    verify_csrf(request)
    client = await _get_client(account)
    if client is not None:
        try:
            if client.is_connected:
                await client.stop()
        except Exception:
            pass
        async with clients_lock:
            if client in clients:
                clients.remove(client)
    clients_dict.pop(account, None)
    await task_manager.release_accounts([account])

    global accounts_cache
    accounts_cache[:] = [a for a in accounts_cache if a["name"] != account]
    dialog_caches.pop(account, None)
    dialog_locks.pop(account, None)

    for ext in [".session", ".session-journal", ".json"]:
        fpath = SESSIONS_DIR / f"{account}{ext}"
        if fpath.exists():
            try:
                os.remove(fpath)
            except Exception:
                logger.exception(f"Failed to delete {fpath}")

    # Удаляем аккаунт и связанные данные из SQLite базы
    try:
        async with get_db() as db:
            await db.execute("DELETE FROM accounts WHERE name = ?", (account,))
            await db.execute("DELETE FROM messages WHERE account = ?", (account,))
            await db.execute("DELETE FROM lead_profiles WHERE account = ?", (account,))
            await db.commit()
    except Exception as e:
        logger.error(f"Error removing account {account} from DB: {e}")

    return JSONResponse({"ok": True, "message": f"Аккаунт {account} удалён"})

@router.post("/api/broadcast", dependencies=[Depends(get_current_user)])
async def api_broadcast(
    request: Request,
    account: str = Form(...),
    chat_ids: str = Form(...),
    message_text: str = Form(...)
):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)

    # Превращаем строку "123,456,789" в список чисел
    ids_list = [int(x.strip()) for x in chat_ids.split(",") if x.strip()]
    if not ids_list or not message_text.strip():
        return JSONResponse({"ok": False, "error": "Нет чатов или текста"}, status_code=400)

    from farm_tools_router import process_spintax
    from pyrogram.errors import FloodWait

    success_count = 0
    for cid in ids_list:
        try:
            text_to_send = process_spintax(message_text)
            await client.send_message(chat_id=cid, text=text_to_send)
            success_count += 1
            await asyncio.sleep(0.5)  # Защита от FloodWait
        except FloodWait as e:
            logger.warning(f"FloodWait on {account}: sleep {e.value}s")
            break
        except Exception as e:
            logger.error(f"Ошибка рассылки в чат {cid}: {e}")

    return JSONResponse({"ok": True, "sent": success_count, "total": len(ids_list)})

@router.get("/api/feed", dependencies=[Depends(get_current_user)])
async def api_get_feed(request: Request, limit: int = 50, accounts: str = None):
    await check_rate_limit(request, max_req=1200, scope="read")
    async with get_db() as db:
        db.row_factory = aiosqlite.Row
        
        if accounts:
            acc_list = accounts.split(",")
            placeholders = ",".join(["?"] * len(acc_list))
            query = f"SELECT * FROM messages WHERE account IN ({placeholders}) ORDER BY date DESC, id DESC LIMIT ?"
            params = tuple(acc_list) + (limit,)
            cursor = await db.execute(query, params)
        else:
            cursor = await db.execute(
                "SELECT * FROM messages ORDER BY date DESC, id DESC LIMIT ?", (limit,)
            )
        rows = await cursor.fetchall()
        items = [dict(row) for row in rows]
        
    for item in items:
        acc = item.get("account")
        chat_id = item.get("chat_id")
        
        item["unread_count"] = 1 if not item.get("is_read") and not item.get("is_outgoing") else 0
        
        chat_type = "private" if (chat_id and chat_id > 0) else "group"
        folder_id = 0
        
        caches_to_check = [dialog_caches[acc]] if (acc in dialog_caches and "items" in dialog_caches[acc]) else []
        if not caches_to_check:
            caches_to_check = [c for c in dialog_caches.values() if "items" in c]
            
        found_cache = False
        for cache in caches_to_check:
            for dlg in cache.get("items", []):
                if dlg.get("id") == chat_id:
                    item["unread_count"] = dlg.get("unread", item["unread_count"])
                    chat_type = dlg.get("type") or chat_type
                    folder_id = dlg.get("folder_id", 0)
                    item["online"] = dlg.get("online", False)
                    item["status_text"] = dlg.get("status_text", "")
                    found_cache = True
                    break
            if found_cache:
                break
                
        item["type"] = chat_type
        item["folder_id"] = folder_id
                    
    return JSONResponse({"ok": True, "items": items})

@router.get("/api/proxy_groups", dependencies=[Depends(get_current_user)])
async def api_get_proxy_groups(request: Request):
    await check_rate_limit(request, max_req=1200, scope="read")
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT g.id, g.title, g.created_at,
                   COUNT(p.id) as proxies_count,
                   SUM(CASE WHEN p.status = 'working' THEN 1 ELSE 0 END) as working_count,
                   (SELECT COUNT(*) FROM accounts a JOIN proxies pr ON a.proxy_id = pr.id WHERE pr.proxy_group_id = g.id) as accounts_count
            FROM proxy_groups g
            LEFT JOIN proxies p ON p.proxy_group_id = g.id
            GROUP BY g.id, g.title, g.created_at
            ORDER BY g.id ASC
        """)
        rows = await cursor.fetchall()
        groups = [{
            "id": r[0],
            "title": r[1],
            "created_at": r[2],
            "proxies_count": r[3] or 0,
            "working_count": r[4] or 0,
            "accounts_count": r[5] or 0
        } for r in rows]

        # Статистика для прокси "Без группы"
        cur_nogroup = await db.execute("""
            SELECT COUNT(p.id),
                   SUM(CASE WHEN p.status = 'working' THEN 1 ELSE 0 END),
                   (SELECT COUNT(*) FROM accounts a JOIN proxies pr ON a.proxy_id = pr.id WHERE pr.proxy_group_id IS NULL)
            FROM proxies p
            WHERE p.proxy_group_id IS NULL
        """)
        ng_row = await cur_nogroup.fetchone()
        nogroup_stats = {
            "proxies_count": ng_row[0] if ng_row else 0,
            "working_count": ng_row[1] if ng_row and ng_row[1] else 0,
            "accounts_count": ng_row[2] if ng_row and ng_row[2] else 0
        }

    return JSONResponse({"ok": True, "groups": groups, "nogroup": nogroup_stats})


@router.post("/api/proxy_group/create", dependencies=[Depends(get_current_user)])
async def api_proxy_group_create(request: Request, title: str = Form(...)):
    await check_rate_limit(request, max_req=60, scope="write")
    verify_csrf(request)
    title = title.strip()
    if not title:
        return JSONResponse({"ok": False, "error": "Название группы не может быть пустым"})

    async with get_db() as db:
        try:
            import time
            now = int(time.time())
            cursor = await db.execute(
                "INSERT INTO proxy_groups (title, created_at) VALUES (?, ?)",
                (title, now)
            )
            group_id = cursor.lastrowid
            await db.commit()
            return JSONResponse({"ok": True, "group_id": group_id, "title": title})
        except aiosqlite.IntegrityError:
            return JSONResponse({"ok": False, "error": "Группа прокси с таким названием уже существует"})


@router.post("/api/proxy_group/delete", dependencies=[Depends(get_current_user)])
async def api_proxy_group_delete(request: Request, group_id: int = Form(...)):
    await check_rate_limit(request, max_req=60, scope="write")
    verify_csrf(request)
    async with get_db() as db:
        # Отвязываем прокси от удаляемой группы (перемещаем в 'Без группы')
        await db.execute("UPDATE proxies SET proxy_group_id = NULL WHERE proxy_group_id = ?", (group_id,))
        await db.execute("DELETE FROM proxy_groups WHERE id = ?", (group_id,))
        await db.commit()
    return JSONResponse({"ok": True})


@router.post("/api/proxy_group/rename", dependencies=[Depends(get_current_user)])
async def api_proxy_group_rename(request: Request, group_id: int = Form(...), title: str = Form(...)):
    await check_rate_limit(request, max_req=60, scope="write")
    verify_csrf(request)
    title = title.strip()
    if not title:
        return JSONResponse({"ok": False, "error": "Название не может быть пустым"})
    async with get_db() as db:
        try:
            await db.execute("UPDATE proxy_groups SET title = ? WHERE id = ?", (title, group_id))
            await db.commit()
            return JSONResponse({"ok": True})
        except aiosqlite.IntegrityError:
            return JSONResponse({"ok": False, "error": "Группа с таким названием уже существует"})


@router.post("/api/add_proxy", dependencies=[Depends(get_current_user)])
async def api_add_proxy(
    request: Request,
    host: str = Form(""),
    port: str = Form(""),
    username: str = Form(""),
    password: str = Form(""),
    bulk_text: str = Form(""),
    proxy_group_id: Optional[str] = Form(None)
):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    
    target_group_id = None
    if proxy_group_id and str(proxy_group_id).strip().isdigit():
        target_group_id = int(str(proxy_group_id).strip())

    added_count = 0
    async with get_db() as db:
        # 1. Массовая загрузка
        if bulk_text:
            for line in bulk_text.strip().split('\n'):
                parsed = parse_proxy_string(line)
                if parsed:
                    try:
                        await db.execute(
                            "INSERT INTO proxies (host, port, username, password, proxy_group_id) VALUES (?, ?, ?, ?, ?)",
                            (parsed["hostname"], parsed["port"], parsed.get("username", ""), parsed.get("password", ""), target_group_id)
                        )
                        added_count += 1
                    except Exception:
                        pass
        
        # 2. Поштучная загрузка
        elif host and port:
            try:
                await db.execute(
                    "INSERT INTO proxies (host, port, username, password, proxy_group_id) VALUES (?, ?, ?, ?, ?)",
                    (host, int(port), username, password, target_group_id)
                )
                added_count += 1
            except Exception:
                pass
        
        await db.commit()
    
    return JSONResponse({"ok": True, "added": added_count})


@router.get("/api/proxies", dependencies=[Depends(get_current_user)])
async def api_get_proxies(request: Request, group_id: Optional[str] = None):
    await check_rate_limit(request, max_req=1200, scope="read")
    async with get_db() as db:
        sql = """
            SELECT p.id, p.host, p.port, p.username, p.status, p.ping_ms, p.last_check, 
                   p.proxy_group_id, g.title as group_title,
                   (SELECT COUNT(*) FROM accounts WHERE proxy_id = p.id) as accounts_count,
                   (SELECT GROUP_CONCAT(name, ', ') FROM accounts WHERE proxy_id = p.id) as bound_accounts
            FROM proxies p
            LEFT JOIN proxy_groups g ON g.id = p.proxy_group_id
        """
        params = []
        if group_id:
            if group_id == "nogroup":
                sql += " WHERE p.proxy_group_id IS NULL"
            elif group_id.isdigit():
                sql += " WHERE p.proxy_group_id = ?"
                params.append(int(group_id))

        sql += " ORDER BY p.id DESC"

        cursor = await db.execute(sql, tuple(params))
        rows = await cursor.fetchall()
        proxies = [{
            "id": r[0], 
            "host": r[1], 
            "port": r[2], 
            "username": r[3],
            "status": r[4] or "unknown",
            "ping_ms": r[5] or 0,
            "last_check": r[6] or 0,
            "proxy_group_id": r[7],
            "group_title": r[8] or ("Без группы" if not r[7] else f"Группа #{r[7]}"),
            "accounts_count": r[9] or 0,
            "bound_accounts": r[10] or ""
        } for r in rows]
    return JSONResponse({"ok": True, "proxies": proxies})
@router.post("/api/proxy/check", dependencies=[Depends(get_current_user)])
async def api_proxy_check(request: Request, proxy_id: int = Form(...)):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    import time
    
    async with get_db() as db:
        cursor = await db.execute("SELECT host, port, username, password FROM proxies WHERE id = ?", (proxy_id,))
        row = await cursor.fetchone()
        if not row:
            return JSONResponse({"ok": False, "error": "Proxy not found"})
        
        host, port, username, password = row
        status = "failed"
        start_time = time.monotonic()
        
        schemes = ["socks5", "http"]
        for scheme in schemes:
            proxy_url = f"{scheme}://{username}:{password}@{host}:{port}" if username else f"{scheme}://{host}:{port}"
            try:
                import aiohttp
                from aiohttp_socks import ProxyConnector
                connector = ProxyConnector.from_url(proxy_url)
                async with aiohttp.ClientSession(connector=connector) as session:
                    async with session.get("https://api.telegram.org", timeout=6) as resp:
                        if resp.status:
                            status = "working"
                            break
            except Exception:
                continue
            
        ping_ms = int((time.monotonic() - start_time) * 1000)
        last_check = int(time.time())
        
        await db.execute("UPDATE proxies SET status = ?, ping_ms = ?, last_check = ? WHERE id = ?", 
                         (status, ping_ms, last_check, proxy_id))
        await db.commit()
        
        return JSONResponse({"ok": True, "status": status, "ping_ms": ping_ms, "last_check": last_check})

@router.post("/api/proxy/check_all", dependencies=[Depends(get_current_user)])
async def api_proxy_check_all(request: Request, proxy_group_id: Optional[str] = Form(None)):
    await check_rate_limit(request, max_req=30, scope="write")
    verify_csrf(request)
    import asyncio, time
    async with get_db() as db:
        if proxy_group_id and proxy_group_id.isdigit():
            cursor = await db.execute("SELECT id, host, port, username, password FROM proxies WHERE proxy_group_id = ?", (int(proxy_group_id),))
        elif proxy_group_id == "nogroup":
            cursor = await db.execute("SELECT id, host, port, username, password FROM proxies WHERE proxy_group_id IS NULL")
        else:
            cursor = await db.execute("SELECT id, host, port, username, password FROM proxies")
        rows = await cursor.fetchall()
    
    sem = asyncio.Semaphore(8)
    
    async def _check_one(r):
        p_id, host, port, username, password = r
        status = "failed"
        start_time = time.monotonic()
        schemes = ["socks5", "http"]
        for scheme in schemes:
            proxy_url = f"{scheme}://{username}:{password}@{host}:{port}" if username else f"{scheme}://{host}:{port}"
            try:
                import aiohttp
                from aiohttp_socks import ProxyConnector
                async with sem:
                    connector = ProxyConnector.from_url(proxy_url)
                    async with aiohttp.ClientSession(connector=connector) as session:
                        async with session.get("https://api.telegram.org", timeout=6) as resp:
                            if resp.status:
                                status = "working"
                                break
            except Exception:
                continue
        ping_ms = int((time.monotonic() - start_time) * 1000)
        last_check = int(time.time())
        async with get_db() as db:
            await db.execute("UPDATE proxies SET status = ?, ping_ms = ?, last_check = ? WHERE id = ?",
                             (status, ping_ms, last_check, p_id))
            await db.commit()
        return {"id": p_id, "status": status, "ping_ms": ping_ms}

    tasks = [_check_one(r) for r in rows]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    return JSONResponse({"ok": True, "count": len(rows)})


@router.post("/api/proxy/move_group", dependencies=[Depends(get_current_user)])
async def api_proxy_move_group(
    request: Request,
    proxy_ids: str = Form(...),
    target_group_id: Optional[str] = Form(None)
):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    ids = [int(x.strip()) for x in proxy_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return JSONResponse({"ok": False, "error": "Не выбрано ни одного прокси"})
    
    tgt_id = int(target_group_id.strip()) if target_group_id and target_group_id.strip().isdigit() else None
    
    async with get_db() as db:
        placeholders = ",".join("?" for _ in ids)
        await db.execute(f"UPDATE proxies SET proxy_group_id = ? WHERE id IN ({placeholders})", (tgt_id, *ids))
        await db.commit()
    return JSONResponse({"ok": True, "count": len(ids)})


@router.post("/api/proxy/distribute", dependencies=[Depends(get_current_user)])
async def api_proxy_distribute(
    request: Request,
    proxy_group_id: Optional[str] = Form(None),
    work_group_id: Optional[str] = Form(None),
    accounts: str = Form(""),
    accounts_per_proxy: int = Form(1)
):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    
    from utils import allocate_proxies_to_accounts
    
    target_pg_id = int(proxy_group_id.strip()) if proxy_group_id and proxy_group_id.strip().isdigit() else None
    target_wg_id = int(work_group_id.strip()) if work_group_id and work_group_id.strip().isdigit() else None
    
    acc_list = [a.strip() for a in accounts.split(",") if a.strip()]
    if not acc_list and target_wg_id:
        async with get_db() as db:
            cursor = await db.execute("SELECT name FROM accounts WHERE work_group_id = ?", (target_wg_id,))
            acc_list = [r[0] for r in await cursor.fetchall()]
    
    if not acc_list:
        return JSONResponse({"ok": False, "error": "Не выбрано ни одного аккаунта для распределения"})
        
    mapping = await allocate_proxies_to_accounts(
        account_names=acc_list,
        proxy_group_id=target_pg_id,
        accounts_per_proxy=accounts_per_proxy,
        work_group_id=target_wg_id
    )
    
    return JSONResponse({"ok": True, "distributed": len(mapping), "mapping": mapping})


@router.post("/api/proxy/delete", dependencies=[Depends(get_current_user)])
async def api_proxy_delete(request: Request, proxy_id: int = Form(...)):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    async with get_db() as db:
        await db.execute("UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ?", (proxy_id,))
        await db.execute("DELETE FROM proxies WHERE id = ?", (proxy_id,))
        await db.commit()
    return JSONResponse({"ok": True})

@router.post("/api/proxy/assign", dependencies=[Depends(get_current_user)])
async def api_proxy_assign(request: Request, proxy_id: int = Form(...), accounts: str = Form("")):
    await check_rate_limit(request, max_req=50, scope="write")
    verify_csrf(request)
    
    acc_list = [a.strip() for a in accounts.split(",") if a.strip()]
    affected_accounts = set(acc_list)
        
    async with get_db() as db:
        if proxy_id == 0:
            for acc in acc_list:
                await db.execute("UPDATE accounts SET proxy_id = NULL WHERE name = ?", (acc,))
        else:
            # Find accounts currently bound to this proxy to detect unassigned ones
            cursor = await db.execute("SELECT name FROM accounts WHERE proxy_id = ?", (proxy_id,))
            current_bound = [r[0] for r in await cursor.fetchall()]
            affected_accounts.update(current_bound)
            
            if acc_list:
                placeholders = ",".join("?" for _ in acc_list)
                await db.execute(f"UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ? AND name NOT IN ({placeholders})", (proxy_id, *acc_list))
                for acc in acc_list:
                    await db.execute("UPDATE accounts SET proxy_id = ? WHERE name = ?", (proxy_id, acc))
            else:
                await db.execute("UPDATE accounts SET proxy_id = NULL WHERE proxy_id = ?", (proxy_id,))
        await db.commit()
        
    from main import clients, clients_lock
    from utils import start_single_client
    from logger import logger
    
    for acc in affected_accounts:
        async with clients_lock:
            old_client = next((c for c in clients if c.name == acc), None)
            if old_client:
                try:
                    if getattr(old_client, "is_connected", False):
                        await old_client.disconnect()
                except Exception:
                    pass
                try:
                    old_client.storage.close()
                except Exception:
                    pass
                clients.remove(old_client)
        try:
            await start_single_client(acc)
            logger.info(f"Client {acc} restarted with updated proxy successfully")
        except Exception as e:
            logger.error(f"Failed to restart client {acc}: {e}")

    return JSONResponse({"ok": True})


# ==============================================================================
# CRM: ГРУППЫ ЛИДОВ И ПРОФИЛЬ ЛИДА (Column 5 "Описание")
# ==============================================================================

@router.get("/api/lead_groups", dependencies=[Depends(get_current_user)])
async def api_get_lead_groups(request: Request):
    await check_rate_limit(request, max_req=300, scope="read")
    async with get_db() as db:
        cursor = await db.execute("SELECT id, name, color, created_at FROM lead_groups ORDER BY id ASC")
        rows = await cursor.fetchall()
        groups = [{"id": r[0], "name": r[1], "color": r[2], "created_at": r[3]} for r in rows]
        
        cursor2 = await db.execute("SELECT group_ids FROM lead_profiles WHERE group_ids != ''")
        profiles = await cursor2.fetchall()
        counts = {g["id"]: 0 for g in groups}
        for (g_str,) in profiles:
            if not g_str:
                continue
            for gid in g_str.split(","):
                gid = gid.strip()
                if gid.isdigit() and int(gid) in counts:
                    counts[int(gid)] += 1
        for g in groups:
            g["lead_count"] = counts.get(g["id"], 0)
            
    return JSONResponse({"ok": True, "groups": groups})


@router.post("/api/lead_groups", dependencies=[Depends(get_current_user)])
async def api_create_lead_group(request: Request):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        body = await request.json()
        name = str(body.get("name", "")).strip()
        color = str(body.get("color", "#00a8ff")).strip()
    else:
        form = await request.form()
        name = str(form.get("name", "")).strip()
        color = str(form.get("color", "#00a8ff")).strip()

    if not name:
        return JSONResponse({"ok": False, "error": "Название группы не может быть пустым"}, status_code=400)
    
    import time
    now = int(time.time())
    try:
        async with get_db() as db:
            cursor = await db.execute(
                "INSERT INTO lead_groups (name, color, created_at) VALUES (?, ?, ?)",
                (name, color, now)
            )
            await db.commit()
            group_id = cursor.lastrowid
        return JSONResponse({"ok": True, "group": {"id": group_id, "name": name, "color": color, "lead_count": 0}})
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"Группа с таким названием уже существует или ошибка: {e}"}, status_code=400)


@router.delete("/api/lead_groups/{group_id}", dependencies=[Depends(get_current_user)])
async def api_delete_lead_group(request: Request, group_id: int):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    async with get_db() as db:
        await db.execute("DELETE FROM lead_groups WHERE id = ?", (group_id,))
        cursor = await db.execute("SELECT chat_id, group_ids FROM lead_profiles WHERE group_ids != ''")
        profiles = await cursor.fetchall()
        for cid, g_str in profiles:
            if not g_str:
                continue
            ids = [x.strip() for x in g_str.split(",") if x.strip() and x.strip() != str(group_id)]
            new_str = ",".join(ids)
            await db.execute("UPDATE lead_profiles SET group_ids = ? WHERE chat_id = ?", (new_str, cid))
        await db.commit()
    return JSONResponse({"ok": True})


@router.get("/api/lead_profile", dependencies=[Depends(get_current_user)])
async def api_get_lead_profile(request: Request, chat_id: int):
    await check_rate_limit(request, max_req=600, scope="read")
    async with get_db() as db:
        cursor = await db.execute("""
            SELECT chat_id, account_name, title, username, notes, group_ids, updated_at
            FROM lead_profiles WHERE chat_id = ?
        """, (chat_id,))
        row = await cursor.fetchone()
        
        cursor_g = await db.execute("SELECT id, name, color FROM lead_groups")
        all_groups = {r[0]: {"id": r[0], "name": r[1], "color": r[2]} for r in await cursor_g.fetchall()}
        
    if not row:
        res_data = {
            "ok": True,
            "chat_id": chat_id,
            "notes": "",
            "group_ids": [],
            "groups": []
        }
        res_data["profile"] = dict(res_data)
        return JSONResponse(res_data)
    
    g_ids = [int(x.strip()) for x in (row[5] or "").split(",") if x.strip().isdigit()]
    assigned_groups = [all_groups[gid] for gid in g_ids if gid in all_groups]
    
    res_data = {
        "ok": True,
        "chat_id": row[0],
        "account_name": row[1] or "",
        "title": row[2] or "",
        "username": row[3] or "",
        "notes": row[4] or "",
        "group_ids": g_ids,
        "groups": assigned_groups,
        "updated_at": row[6] or 0
    }
    res_data["profile"] = dict(res_data)
    return JSONResponse(res_data)


@router.post("/api/lead_profile", dependencies=[Depends(get_current_user)])
async def api_save_lead_profile(request: Request):
    await check_rate_limit(request, max_req=300, scope="write")
    verify_csrf(request)
    
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        body = await request.json()
        chat_id = int(body.get("chat_id", 0))
        notes = str(body.get("notes", "") or "")
        raw_groups = body.get("group_ids", "")
        account_name = str(body.get("account_name", "") or "")
        title = str(body.get("title", "") or "")
        username = str(body.get("username", "") or "")
    else:
        form = await request.form()
        chat_id = int(form.get("chat_id", 0))
        notes = str(form.get("notes", "") or "")
        raw_groups = form.get("group_ids", "")
        account_name = str(form.get("account_name", "") or "")
        title = str(form.get("title", "") or "")
        username = str(form.get("username", "") or "")

    if isinstance(raw_groups, list):
        group_ids_str = ",".join(str(x).strip() for x in raw_groups if str(x).strip())
    else:
        group_ids_str = str(raw_groups or "").strip()

    import time
    now = int(time.time())
    
    async with get_db() as db:
        await db.execute("""
            INSERT INTO lead_profiles (chat_id, account_name, title, username, notes, group_ids, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET
                account_name = COALESCE(NULLIF(excluded.account_name, ''), lead_profiles.account_name),
                title = COALESCE(NULLIF(excluded.title, ''), lead_profiles.title),
                username = COALESCE(NULLIF(excluded.username, ''), lead_profiles.username),
                notes = excluded.notes,
                group_ids = excluded.group_ids,
                updated_at = excluded.updated_at
        """, (chat_id, account_name or "", title or "", username or "", notes or "", group_ids_str, now))
        await db.commit()
        
    return JSONResponse({"ok": True, "saved_at": now})


_format_raw_user_status = format_raw_user_status


CHAT_INFO_CACHE = {}  # (account, chat_id) -> (ts, info_dict)
CHAT_INFO_TTL = 120.0

@router.get("/api/chat_info", dependencies=[Depends(get_current_user)])
async def api_get_chat_info(request: Request, account: str, chat_id: int):
    await check_rate_limit(request, max_req=300, scope="read")
    cache_key = (account, chat_id)
    cached = CHAT_INFO_CACHE.get(cache_key)
    if cached and (time.time() - cached[0] < CHAT_INFO_TTL):
        return JSONResponse({"ok": True, "info": cached[1]})

    client = await _get_client(account)
    if not client:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
        
    try:
        from main import _ensure_peers
        await _ensure_peers(client)
        from pyrogram import raw
        from datetime import date
        from utils import dialog_caches

        # Pre-populate from dialog_caches for instant responsiveness and fallback
        cached_dlg = None
        if account in dialog_caches:
            for it in dialog_caches[account].get("items", []):
                if it.get("id") == chat_id:
                    cached_dlg = it
                    break

        title = (cached_dlg.get("title") if cached_dlg else None) or "Без имени"
        username = (cached_dlg.get("username") if cached_dlg else None) or ""
        phone = (cached_dlg.get("phone") if cached_dlg else None) or ""
        status_text = (cached_dlg.get("status_text") if cached_dlg else None) or "диалог"
        online = cached_dlg.get("online", False) if cached_dlg else False
        ctype = (cached_dlg.get("type") if cached_dlg else None) or ("private" if chat_id > 0 else "group")
        bio = ""
        birthday = ""
        personal_channel = None
        work_hours = ""
        location = ""
        members = None
        invite = None

        try:
            chat = await client.get_chat(chat_id)
            if chat:
                if hasattr(chat, "type"):
                    ctype = chat.type.name.lower() if hasattr(chat.type, "name") else str(chat.type).lower()
                t = chat.title or f"{chat.first_name or ''} {chat.last_name or ''}".strip()
                if t:
                    title = t
                if chat.username:
                    username = chat.username
                b = getattr(chat, "bio", None) or getattr(chat, "description", None)
                if b:
                    bio = b
                members = getattr(chat, "members_count", None)
                invite = getattr(chat, "invite_link", None)
                if getattr(chat, "phone_number", None):
                    phone = chat.phone_number
        except Exception as ex_chat:
            logger.debug(f"get_chat non-critical exception for {chat_id}: {ex_chat}")

        if ctype in ("private", "bot"):
            try:
                peer = await client.resolve_peer(chat_id)
                if isinstance(peer, raw.types.InputPeerUser):
                    input_user = raw.types.InputUser(user_id=peer.user_id, access_hash=peer.access_hash)
                else:
                    input_user = peer

                api_id_val = getattr(client, "api_id", None) or 2040
                wrapped_query = raw.functions.InvokeWithLayer(
                    layer=178,
                    query=raw.functions.InitConnection(
                        api_id=api_id_val,
                        app_version=client.app_version or "Telegram Desktop 4.16.8 x64",
                        device_model=client.device_model or "PC 64bit",
                        system_version=client.system_version or "Windows 10",
                        system_lang_code=getattr(client, "system_lang_code", client.lang_code) or "en",
                        lang_code=getattr(client, "lang_code", client.lang_code) or "en",
                        lang_pack="",
                        query=raw.functions.users.GetFullUser(id=input_user)
                    )
                )
                try:
                    full_res = await client.invoke(wrapped_query)
                except Exception as ex_layer:
                    logger.warning(f"InvokeWithLayer 178 failed, fallback: {ex_layer}")
                    full_res = await client.invoke(raw.functions.users.GetFullUser(id=input_user))

                full_user = getattr(full_res, "full_user", None)
                raw_users = getattr(full_res, "users", [])
                raw_user = raw_users[0] if raw_users else None

                if full_user is not None:
                    if getattr(full_user, "about", None):
                        bio = full_user.about
                    elif getattr(full_user, "business_intro", None):
                        bi = full_user.business_intro
                        parts = [p for p in [getattr(bi, "title", None), getattr(bi, "description", None)] if p]
                        if parts:
                            bio = " — ".join(parts)

                bday = getattr(full_user, "birthday", None)
                if bday is not None:
                    bd_d = getattr(bday, "day", None)
                    bd_m = getattr(bday, "month", None)
                    bd_y = getattr(bday, "year", None)
                    if bd_d and bd_m:
                        MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
                        m_str = MONTHS_RU[bd_m - 1] if 1 <= bd_m <= 12 else f"{bd_m:02d}"
                        if bd_y:
                            today = date.today()
                            age = today.year - bd_y - ((today.month, today.day) < (bd_m, bd_d))
                            def _age_str(a):
                                if 11 <= (a % 100) <= 14:
                                    return f"{a} лет"
                                r = a % 10
                                if r == 1:
                                    return f"{a} год"
                                if 2 <= r <= 4:
                                    return f"{a} года"
                                return f"{a} лет"
                            birthday = f"{bd_d} {m_str} {bd_y} ({_age_str(age)})"
                        else:
                            birthday = f"{bd_d} {m_str}"

                p_chan_id = getattr(full_user, "personal_channel_id", None)
                p_msg_id = getattr(full_user, "personal_channel_message", None)
                if p_chan_id is not None:
                    chan_obj = None
                    for c in getattr(full_res, "chats", []):
                        if getattr(c, "id", None) == p_chan_id:
                            chan_obj = c
                            break
                    chan_title = getattr(chan_obj, "title", "") if chan_obj else ""
                    chan_username = getattr(chan_obj, "username", "") if chan_obj else ""
                    subscribers_count = getattr(chan_obj, "participants_count", None) if chan_obj else None
                    subscribers_str = ""
                    if subscribers_count is not None:
                        def _sub_str(cnt):
                            if 11 <= (cnt % 100) <= 14:
                                return f"{cnt} подписчиков"
                            r = cnt % 10
                            if r == 1:
                                return f"{cnt} подписчик"
                            if 2 <= r <= 4:
                                return f"{cnt} подписчика"
                            return f"{cnt} подписчиков"
                        subscribers_str = f"Канал · {_sub_str(subscribers_count)}"
                    else:
                        subscribers_str = "Канал"
                    chan_snippet = ""
                    if p_msg_id:
                        try:
                            chan_msgs = await client.get_messages(p_chan_id, [p_msg_id])
                            if chan_msgs and chan_msgs[0]:
                                m = chan_msgs[0]
                                chan_snippet = (m.text or m.caption or "").strip()
                                if not chan_snippet and m.media:
                                    chan_snippet = "Медиа"
                        except Exception as ex_m:
                            logger.debug(f"Could not fetch personal channel message: {ex_m}")

                    personal_channel = {
                        "id": p_chan_id,
                        "title": chan_title or "Канал",
                        "username": chan_username,
                        "message_id": p_msg_id,
                        "snippet": chan_snippet,
                        "subscribers": subscribers_str,
                        "subscribers_count": subscribers_count,
                        "link": f"https://t.me/{chan_username}" if chan_username else f"https://t.me/c/{p_chan_id}"
                    }

                b_wh = getattr(full_user, "business_work_hours", None)
                if b_wh is not None:
                    open_now = getattr(b_wh, "open_now", False)
                    weekly_open = getattr(b_wh, "weekly_open", [])
                    if weekly_open:
                        first = weekly_open[0]
                        sm = getattr(first, "start_minute", 0)
                        em = getattr(first, "end_minute", 0)
                        s_h, s_m = (sm % 1440) // 60, sm % 60
                        e_h, e_m = (em % 1440) // 60, em % 60
                        time_str = f"{s_h:02d}:{s_m:02d} - {e_h:02d}:{e_m:02d}"
                        prefix = "Открыто" if open_now else "Закрыто"
                        work_hours = f"{prefix} {time_str}"
                    elif open_now:
                        work_hours = "Открыто сейчас"
                    else:
                        work_hours = "Закрыто"

                b_loc = getattr(full_user, "business_location", None)
                if b_loc is not None:
                    location = getattr(b_loc, "address", "") or ""

                if raw_user:
                    if getattr(raw_user, "bot", False):
                        status_text = "бот"
                    elif getattr(raw_user, "status", None):
                        status_text, online = _format_raw_user_status(raw_user.status)
                    if getattr(raw_user, "phone", None):
                        p = str(raw_user.phone).strip()
                        phone = f"+{p}" if not p.startswith("+") else p
                    if getattr(raw_user, "username", None):
                        username = raw_user.username
                    fn = getattr(raw_user, "first_name", "") or ""
                    ln = getattr(raw_user, "last_name", "") or ""
                    u_title = f"{fn} {ln}".strip()
                    if u_title:
                        title = u_title
            except Exception as ex:
                logger.warning(f"Raw GetFullUser error: {ex}", exc_info=True)
                try:
                    user = await client.get_users(chat_id)
                    if getattr(user, "is_bot", False):
                        status_text = "бот"
                    elif getattr(user, "status", None):
                        st_name = str(getattr(user.status, "name", user.status)).lower()
                        if "online" in st_name:
                            status_text = "в сети"
                            online = True
                        elif "recently" in st_name:
                            status_text = "был(а) недавно"
                        elif "last_week" in st_name:
                            status_text = "был(а) на этой неделе"
                        elif "last_month" in st_name:
                            status_text = "был(а) в этом месяце"
                        else:
                            status_text = "не в сети"
                    if getattr(user, "phone_number", None):
                        phone = user.phone_number
                    if getattr(user, "username", None):
                        username = user.username
                except Exception:
                    pass
        elif ctype in ("channel", "supergroup"):
            try:
                peer = await client.resolve_peer(chat_id)
                if isinstance(peer, raw.types.InputPeerChannel):
                    input_channel = raw.types.InputChannel(channel_id=peer.channel_id, access_hash=peer.access_hash)
                else:
                    input_channel = peer
                full_chan = await client.invoke(raw.functions.channels.GetFullChannel(channel=input_channel))
                if full_chan and getattr(full_chan, "full_chat", None):
                    fc = full_chan.full_chat
                    if getattr(fc, "about", None):
                        bio = fc.about
                    if getattr(fc, "participants_count", None):
                        members = fc.participants_count
            except Exception as ex:
                logger.debug(f"Raw GetFullChannel error: {ex}")

            if members:
                if ctype == "channel":
                    status_text = f"{members} подписчиков"
                else:
                    status_text = f"{members} участников"
            else:
                status_text = "канал" if ctype == "channel" else "группа"
        else:
            status_text = "группа"
                
        cache = dialog_caches.get(account)
        if cache and cache.get("items"):
            for item in cache["items"]:
                if item.get("id") == chat_id:
                    item["status_text"] = status_text
                    item["online"] = online
                    if title:
                        item["title"] = title
                    if username:
                        item["username"] = username
                    if phone:
                        item["phone"] = phone
                    break

        info_data = {
            "id": chat_id,
            "type": ctype,
            "title": title,
            "username": username,
            "bio": bio,
            "birthday": birthday,
            "personal_channel": personal_channel,
            "work_hours": work_hours,
            "location": location,
            "phone": phone,
            "members_count": members,
            "invite_link": invite,
            "status_text": status_text,
            "online": online
        }
        CHAT_INFO_CACHE[cache_key] = (time.time(), info_data)
        return JSONResponse({"ok": True, "info": info_data})
    except Exception as e:
        logger.warning(f"Error fetching chat_info for {chat_id}: {e}")
        return JSONResponse({
            "ok": True,
            "info": {
                "id": chat_id,
                "title": "Без имени",
                "username": "",
                "bio": "",
                "birthday": "",
                "personal_channel": None,
                "phone": "",
                "status_text": "диалог",
                "online": False
            }
        })


SHARED_MEDIA_CACHE = {}  # (account, chat_id, kind) -> (ts, items)
SHARED_MEDIA_TTL = 60.0

@router.get("/api/shared_media", dependencies=[Depends(get_current_user)])
async def api_get_shared_media(request: Request, account: str, chat_id: int, kind: str = "photo", limit: int = 30):
    await check_rate_limit(request, max_req=500, scope="read")
    cache_key = (account, chat_id, kind)
    cached = SHARED_MEDIA_CACHE.get(cache_key)
    if cached and (time.time() - cached[0] < SHARED_MEDIA_TTL):
        return JSONResponse({"ok": True, "items": cached[1], "kind": kind})

    client = await _get_client(account)
    if not client:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
        
    try:
        from main import _ensure_peers
        await _ensure_peers(client)
        from pyrogram import enums
        from urllib.parse import quote
        
        # Безопасное предварительное разрешение пира
        try:
            await client.resolve_peer(chat_id)
        except Exception:
            try:
                if chat_id > 0:
                    await client.get_users([chat_id])
                else:
                    await client.get_chat(chat_id)
            except Exception as peer_err:
                logger.debug(f"Peer pre-resolve warning for {chat_id}: {peer_err}")

        filter_map = {
            "photo": enums.MessagesFilter.PHOTO_VIDEO,
            "document": enums.MessagesFilter.DOCUMENT,
            "url": enums.MessagesFilter.URL,
            "voice": enums.MessagesFilter.VOICE_NOTE
        }
        flt = filter_map.get(kind, enums.MessagesFilter.PHOTO_VIDEO)
        
        items = []
        try:
            async for m in client.search_messages(chat_id=chat_id, filter=flt, limit=min(limit, 50)):
                if not m or not getattr(m, "id", None):
                    continue
                item_data = {
                    "id": m.id,
                    "date": int(m.date.timestamp()) if hasattr(m.date, "timestamp") else 0,
                    "caption": getattr(m, "caption", None) or getattr(m, "text", "") or ""
                }
                if getattr(m, "photo", None):
                    item_data["type"] = "photo"
                    item_data["url"] = f"/api/media?account={quote(account)}&chat_id={chat_id}&message_id={m.id}&kind=photo"
                    items.append(item_data)
                elif getattr(m, "video", None):
                    item_data["type"] = "video"
                    item_data["duration"] = getattr(m.video, "duration", 0)
                    item_data["url"] = f"/api/media?account={quote(account)}&chat_id={chat_id}&message_id={m.id}&kind=video"
                    items.append(item_data)
                elif getattr(m, "document", None):
                    item_data["type"] = "document"
                    item_data["file_name"] = m.document.file_name or "Документ"
                    item_data["file_size"] = m.document.file_size or 0
                    item_data["url"] = f"/api/media?account={quote(account)}&chat_id={chat_id}&message_id={m.id}&kind=document&download=1"
                    items.append(item_data)
                elif getattr(m, "voice", None) or getattr(m, "video_note", None):
                    item_data["type"] = "voice"
                    v_obj = m.voice or m.video_note
                    item_data["duration"] = getattr(v_obj, "duration", 0)
                    item_data["url"] = f"/api/media?account={quote(account)}&chat_id={chat_id}&message_id={m.id}&kind={'voice' if m.voice else 'video_note'}"
                    items.append(item_data)
                elif kind == "url":
                    text = m.text or m.caption or ""
                    import re
                    urls = re.findall(r'https?://[^\s<>"]+|www\.[^\s<>"]+', text)
                    if urls:
                        for u in urls:
                            full_u = u if u.startswith("http") else f"https://{u}"
                            items.append({
                                "id": m.id,
                                "type": "url",
                                "url": full_u,
                                "web_url": full_u,
                                "web_title": getattr(m.web_page, "title", None) or full_u,
                                "date": int(m.date.timestamp()) if hasattr(m.date, "timestamp") else 0,
                                "caption": text
                            })
                    elif getattr(m, "web_page", None):
                        items.append({
                            "id": m.id,
                            "type": "url",
                            "url": m.web_page.url or "",
                            "web_url": m.web_page.url or "",
                            "web_title": m.web_page.title or m.web_page.url or "",
                            "date": int(m.date.timestamp()) if hasattr(m.date, "timestamp") else 0,
                            "caption": text
                        })
        except Exception as search_err:
            logger.warning(f"Error during search_messages in api_get_shared_media: {search_err}")
            
        if items:
            SHARED_MEDIA_CACHE[cache_key] = (time.time(), items)
        return JSONResponse({"ok": True, "items": items, "kind": kind})
    except Exception as e:
        logger.warning(f"Error fetching shared_media for {chat_id}: {e}", exc_info=True)
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)


# ==============================================================================
# ЗАГОТОВКИ И СКРИПТЫ (QUICK REPLIES & AUDIO PRESETS)
# ==============================================================================

QUICK_REPLIES_DIR = Path("data/quick_replies")
QUICK_REPLIES_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/api/quick_replies", dependencies=[Depends(get_current_user)])
async def api_get_quick_replies(request: Request, reply_type: Optional[str] = None):
    await check_rate_limit(request, max_req=1200, scope="read")
    async with get_db() as db:
        if reply_type:
            cursor = await db.execute(
                "SELECT id, title, reply_type, category, content_text, file_path, duration, created_at FROM quick_replies WHERE reply_type = ? ORDER BY category ASC, id DESC",
                (reply_type,)
            )
        else:
            cursor = await db.execute(
                "SELECT id, title, reply_type, category, content_text, file_path, duration, created_at FROM quick_replies ORDER BY category ASC, id DESC"
            )
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r[0],
                "title": r[1],
                "reply_type": r[2],
                "category": r[3] or "Общее",
                "content_text": r[4] or "",
                "file_path": r[5] or "",
                "duration": r[6] or 0,
                "created_at": r[7]
            })
    return JSONResponse({"ok": True, "replies": result})


@router.post("/api/quick_replies", dependencies=[Depends(get_current_user)])
async def api_create_quick_reply(
    request: Request,
    title: str = Form(...),
    reply_type: str = Form(...),
    category: Optional[str] = Form("Общее"),
    content_text: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    
    file_path_str = ""
    duration = 0
    now = int(time.time())
    
    if reply_type in ("voice", "video_note") and audio_file:
        file_bytes = await audio_file.read()
        if not file_bytes:
            return JSONResponse({"ok": False, "error": "Файл пуст"}, status_code=400)
        ext = Path(audio_file.filename or "voice.ogg").suffix.lower()
        if not ext:
            ext = ".ogg" if reply_type == "voice" else ".mp4"
        filename = f"{uuid.uuid4().hex[:12]}_{re.sub(r'[^a-zA-Z0-9_.-]', '_', audio_file.filename or 'record')}{ext}"
        target = QUICK_REPLIES_DIR / filename
        with open(target, "wb") as f:
            f.write(file_bytes)
        file_path_str = str(target.as_posix())
        
    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO quick_replies (title, reply_type, category, content_text, file_path, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title.strip(), reply_type, (category or "Общее").strip(), content_text or "", file_path_str, duration, now)
        )
        await db.commit()
        new_id = cursor.lastrowid
        
    return JSONResponse({"ok": True, "id": new_id})


@router.post("/api/quick_replies/save_from_message", dependencies=[Depends(get_current_user)])
async def api_save_quick_reply_from_message(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    message_id: int = Form(...),
    title: Optional[str] = Form(None),
    category: Optional[str] = Form("Общее")
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)

    try:
        msg = await client.get_messages(chat_id, message_id)
    except Exception as e:
        logger.error(f"Error getting message {message_id} in {chat_id}: {e}")
        return JSONResponse({"ok": False, "error": f"Ошибка получения сообщения: {e}"}, status_code=400)

    if not msg:
        return JSONResponse({"ok": False, "error": "Сообщение не найдено"}, status_code=404)

    reply_type = None
    duration = 0
    ext = ""

    if getattr(msg, "voice", None):
        reply_type = "voice"
        duration = int(getattr(msg.voice, "duration", 0) or 0)
        ext = ".ogg"
        default_title = f"Голосовое ({duration}с)" if duration else "Голосовое сообщение"
    elif getattr(msg, "video_note", None):
        reply_type = "video_note"
        duration = int(getattr(msg.video_note, "duration", 0) or 0)
        ext = ".mp4"
        default_title = f"Кружок ({duration}с)" if duration else "Видеосообщение"
    elif getattr(msg, "audio", None):
        reply_type = "voice"
        duration = int(getattr(msg.audio, "duration", 0) or 0)
        ext = ".ogg"
        default_title = f"Аудио ({duration}с)" if duration else "Аудиозапись"
    else:
        return JSONResponse({"ok": False, "error": "В этом сообщении нет голосового сообщения или кружка"}, status_code=400)

    filename = f"{uuid.uuid4().hex[:12]}_{reply_type}{ext}"
    target = QUICK_REPLIES_DIR / filename

    try:
        downloaded = await client.download_media(msg, file_name=str(target))
        if not downloaded or not os.path.exists(downloaded):
            return JSONResponse({"ok": False, "error": "Не удалось скачать файл из Telegram"}, status_code=500)
    except Exception as e:
        logger.error(f"Error downloading media for quick reply: {e}")
        return JSONResponse({"ok": False, "error": f"Ошибка скачивания медиа: {e}"}, status_code=500)

    file_path_str = str(Path(downloaded).as_posix())
    final_title = (title or "").strip() or default_title
    final_cat = (category or "").strip() or "Общее"
    now = int(time.time())

    async with get_db() as db:
        cursor = await db.execute(
            "INSERT INTO quick_replies (title, reply_type, category, content_text, file_path, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (final_title, reply_type, final_cat, "", file_path_str, duration, now)
        )
        await db.commit()
        new_id = cursor.lastrowid

    return JSONResponse({
        "ok": True,
        "id": new_id,
        "title": final_title,
        "reply_type": reply_type,
        "category": final_cat,
        "duration": duration
    })


@router.delete("/api/quick_replies/{reply_id}", dependencies=[Depends(get_current_user)])
async def api_delete_quick_reply(request: Request, reply_id: int):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    async with get_db() as db:
        cursor = await db.execute("SELECT file_path FROM quick_replies WHERE id = ?", (reply_id,))
        row = await cursor.fetchone()
        if row and row[0]:
            try:
                p = Path(row[0])
                if p.exists():
                    p.unlink(missing_ok=True)
            except Exception:
                pass
        await db.execute("DELETE FROM quick_replies WHERE id = ?", (reply_id,))
        await db.commit()
    return JSONResponse({"ok": True})


@router.get("/api/quick_replies/audio/{reply_id}")
async def api_get_quick_reply_audio(request: Request, reply_id: int):
    async with get_db() as db:
        cursor = await db.execute("SELECT file_path, reply_type FROM quick_replies WHERE id = ?", (reply_id,))
        row = await cursor.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="Audio not found")
    p = Path(row[0])
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    media_type = "audio/ogg" if row[1] == "voice" else "video/mp4"
    return FileResponse(path=str(p), media_type=media_type)


@router.post("/api/quick_replies/send", dependencies=[Depends(get_current_user)])
async def api_send_quick_reply(
    request: Request,
    account: str = Form(...),
    chat_id: int = Form(...),
    reply_id: int = Form(...),
    emulate_delay: Optional[int] = Form(0),
    reply_to_message_id: Optional[int] = Form(None)
):
    await check_rate_limit(request, max_req=120, scope="write")
    verify_csrf(request)
    client = await _get_client(account)
    if client is None:
        return JSONResponse({"ok": False, "error": "Аккаунт не найден"}, status_code=404)
    if client.me is None:
        client.me = await client.get_me()
        
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT title, reply_type, content_text, file_path FROM quick_replies WHERE id = ?",
            (reply_id,)
        )
        row = await cursor.fetchone()
        
    if not row:
        return JSONResponse({"ok": False, "error": "Заготовка не найдена"}, status_code=404)
        
    r_title, r_type, r_text, r_file = row[0], row[1], row[2], row[3]
    from pyrogram.enums import ChatAction
    from farm_tools_router import process_spintax
    
    try:
        if r_type == "text":
            final_text = process_spintax(r_text or "")
            if emulate_delay and emulate_delay > 0:
                try:
                    await client.send_chat_action(chat_id, ChatAction.TYPING)
                    await asyncio.sleep(min(emulate_delay, 10))
                except Exception:
                    pass
            kwargs = {"chat_id": chat_id, "text": final_text}
            if reply_to_message_id:
                kwargs["reply_to_message_id"] = reply_to_message_id
            msg = await client.send_message(**kwargs)
            return JSONResponse({"ok": True, "id": msg.id, "text": final_text})
            
        elif r_type == "voice":
            if not r_file or not os.path.exists(r_file):
                return JSONResponse({"ok": False, "error": "Аудиофайл заготовки не найден на диске"}, status_code=404)
            if emulate_delay and emulate_delay > 0:
                try:
                    await client.send_chat_action(chat_id, ChatAction.RECORD_AUDIO)
                    await asyncio.sleep(min(emulate_delay, 15))
                except Exception:
                    pass
            kwargs = {"chat_id": chat_id, "voice": r_file}
            if reply_to_message_id:
                kwargs["reply_to_message_id"] = reply_to_message_id
            msg = await client.send_voice(**kwargs)
            return JSONResponse({"ok": True, "id": msg.id})
            
        elif r_type == "video_note":
            if not r_file or not os.path.exists(r_file):
                return JSONResponse({"ok": False, "error": "Файл кружка не найден на диске"}, status_code=404)
            if emulate_delay and emulate_delay > 0:
                try:
                    await client.send_chat_action(chat_id, ChatAction.RECORD_VIDEO_NOTE)
                    await asyncio.sleep(min(emulate_delay, 15))
                except Exception:
                    pass
            kwargs = {"chat_id": chat_id, "video_note": r_file}
            if reply_to_message_id:
                kwargs["reply_to_message_id"] = reply_to_message_id
            msg = await client.send_video_note(**kwargs)
            return JSONResponse({"ok": True, "id": msg.id})
            
        else:
            return JSONResponse({"ok": False, "error": f"Неизвестный тип заготовки: {r_type}"}, status_code=400)
    except Exception as e:
        logger.exception(f"Error sending quick reply {reply_id} to {chat_id}")
        return JSONResponse({"ok": False, "error": str(e)}, status_code=502)


