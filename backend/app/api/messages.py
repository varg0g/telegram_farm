import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from telethon.errors import FloodWaitError, RPCError
from app.core.security import get_current_admin
from app.core.config import UPLOADS_DIR
from app.services.chat_service import (
    get_chat_messages, send_text_message, send_voice_message,
    send_video_note_message, send_file_message, click_bot_button
)
from app.db.database import db

router = APIRouter(prefix="/api/messages", tags=["messages"], dependencies=[Depends(get_current_admin)])

class SendTextRequest(BaseModel):
    text: str
    reply_to_msg_id: Optional[int] = None

class ClickButtonRequest(BaseModel):
    message_id: int
    button_data: str

class QuickReplyCreate(BaseModel):
    title: str
    category: str = "Общее"
    reply_type: str = "text"
    content_text: str = ""

@router.get("/{account_phone}/{chat_id}")
async def api_get_messages(
    account_phone: str,
    chat_id: int,
    limit: int = Query(60, ge=1, le=200),
    offset_id: int = Query(0, ge=0)
):
    """Возвращает историю сообщений чата из локальной БД."""
    return await get_chat_messages(account_phone, chat_id, limit=limit, offset_id=offset_id)

@router.post("/{account_phone}/{chat_id}/send")
async def api_send_text(account_phone: str, chat_id: int, req: SendTextRequest):
    """Отправка текстового сообщения."""
    try:
        return await send_text_message(account_phone, chat_id, req.text, reply_to_msg_id=req.reply_to_msg_id)
    except FloodWaitError as fe:
        raise HTTPException(status_code=429, detail=f"Лимит Telegram: подождите {fe.seconds} сек.")
    except RPCError as rpc:
        raise HTTPException(status_code=400, detail=f"Ошибка Telegram: {rpc.message or str(rpc)}")
    except RuntimeError as re:
        raise HTTPException(status_code=400, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось отправить сообщение: {e}")

@router.post("/{account_phone}/{chat_id}/send-voice")
async def api_send_voice(
    account_phone: str,
    chat_id: int,
    voice_file: UploadFile = File(...),
    reply_to_msg_id: Optional[int] = Form(None)
):
    """Отправка нативного голосового сообщения (audio/ogg voice note)."""
    orig_name = Path(voice_file.filename or "voice.ogg").name
    safe_name = f"{uuid.uuid4().hex[:12]}_{orig_name}"
    target_path = UPLOADS_DIR / safe_name
    content = await voice_file.read()
    with open(target_path, "wb") as f:
        f.write(content)
        
    try:
        return await send_voice_message(account_phone, chat_id, target_path, reply_to_msg_id=reply_to_msg_id)
    except FloodWaitError as fe:
        raise HTTPException(status_code=429, detail=f"Лимит Telegram: подождите {fe.seconds} сек.")
    except RPCError as rpc:
        raise HTTPException(status_code=400, detail=f"Ошибка Telegram: {rpc.message or str(rpc)}")
    except RuntimeError as re:
        raise HTTPException(status_code=400, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось отправить голосовое: {e}")

@router.post("/{account_phone}/{chat_id}/send-video-note")
async def api_send_video_note(
    account_phone: str,
    chat_id: int,
    video_file: UploadFile = File(...),
    reply_to_msg_id: Optional[int] = Form(None)
):
    """Отправка круглого видеосообщения (video note)."""
    orig_name = Path(video_file.filename or "vnote.mp4").name
    safe_name = f"{uuid.uuid4().hex[:12]}_{orig_name}"
    target_path = UPLOADS_DIR / safe_name
    content = await video_file.read()
    with open(target_path, "wb") as f:
        f.write(content)
        
    try:
        return await send_video_note_message(account_phone, chat_id, target_path, reply_to_msg_id=reply_to_msg_id)
    except FloodWaitError as fe:
        raise HTTPException(status_code=429, detail=f"Лимит Telegram: подождите {fe.seconds} сек.")
    except RPCError as rpc:
        raise HTTPException(status_code=400, detail=f"Ошибка Telegram: {rpc.message or str(rpc)}")
    except RuntimeError as re:
        raise HTTPException(status_code=400, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось отправить кружочек: {e}")

@router.post("/{account_phone}/{chat_id}/send-file")
async def api_send_file(
    account_phone: str,
    chat_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    reply_to_msg_id: Optional[int] = Form(None)
):
    """Отправка файлов, документов, фото или видео."""
    orig_name = Path(file.filename or "file.bin").name
    safe_name = f"{uuid.uuid4().hex[:12]}_{orig_name}"
    target_path = UPLOADS_DIR / safe_name
    content = await file.read()
    with open(target_path, "wb") as f:
        f.write(content)
        
    try:
        return await send_file_message(account_phone, chat_id, target_path, caption=caption, reply_to_msg_id=reply_to_msg_id)
    except FloodWaitError as fe:
        raise HTTPException(status_code=429, detail=f"Лимит Telegram: подождите {fe.seconds} сек.")
    except RPCError as rpc:
        raise HTTPException(status_code=400, detail=f"Ошибка Telegram: {rpc.message or str(rpc)}")
    except RuntimeError as re:
        raise HTTPException(status_code=400, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Не удалось отправить файл: {e}")

@router.post("/{account_phone}/{chat_id}/click")
async def api_click_button(account_phone: str, chat_id: int, req: ClickButtonRequest):
    """Нажатие инлайн-кнопки в диалоге с ботом."""
    ok = await click_bot_button(account_phone, chat_id, req.message_id, req.button_data)
    return {"status": "ok" if ok else "error"}

# Быстрые ответы и скрипты продаж
@router.get("/quick-replies")
async def api_get_quick_replies():
    return await db.fetch_all("SELECT * FROM quick_replies ORDER BY category ASC, id ASC")

@router.post("/quick-replies")
async def api_create_quick_reply(req: QuickReplyCreate):
    import time
    now = int(time.time())
    q_id = await db.execute("""
        INSERT INTO quick_replies (title, category, reply_type, content_text, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (req.title, req.category, req.reply_type, req.content_text, now))
    return {"id": q_id, "title": req.title}

@router.delete("/quick-replies/{reply_id}")
async def api_delete_quick_reply(reply_id: int):
    await db.execute("DELETE FROM quick_replies WHERE id = ?", (reply_id,))
    return {"status": "ok"}
