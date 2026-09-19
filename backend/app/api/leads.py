import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse
from typing import Optional, List
from pydantic import BaseModel
from app.core.security import get_current_admin
from app.services.lead_service import (
    get_lead_profile, update_lead_profile, get_all_lead_groups,
    create_lead_group, delete_lead_group, get_leomatch_matches,
    update_match_status
)
from app.db.database import db

router = APIRouter(prefix="/api/leads", tags=["leads"], dependencies=[Depends(get_current_admin)])

class UpdateLeadRequest(BaseModel):
    notes: Optional[str] = None
    birthday: Optional[str] = None
    channel_link: Optional[str] = None
    group_ids: Optional[List[int]] = None

class CreateLeadGroupRequest(BaseModel):
    name: str
    color: str = "#3b82f6"

class MatchStatusUpdate(BaseModel):
    status: str

@router.get("/profile/{chat_id}")
async def api_get_lead(chat_id: int, account_phone: Optional[str] = None):
    return await get_lead_profile(chat_id, account_phone)

@router.post("/profile/{chat_id}")
async def api_update_lead(chat_id: int, req: UpdateLeadRequest):
    return await update_lead_profile(
        chat_id=chat_id,
        notes=req.notes,
        birthday=req.birthday,
        channel_link=req.channel_link,
        group_ids=req.group_ids
    )

# Теги воронки лидов
@router.get("/groups")
async def api_get_lead_groups():
    return await get_all_lead_groups()

@router.post("/groups")
async def api_create_lead_group(req: CreateLeadGroupRequest):
    g_id = await create_lead_group(req.name, req.color)
    return {"status": "ok", "id": g_id}

@router.delete("/groups/{group_id}")
async def api_delete_lead_group(group_id: int):
    await delete_lead_group(group_id)
    return {"status": "ok"}

# Экспорт базы лидов (CRM) в CSV или TXT
@router.get("/export")
async def api_export_leads(
    group_id: Optional[int] = None,
    format: str = Query("csv", pattern="^(csv|txt)$")
):
    where = []
    params = []
    if group_id:
        where.append("(lead_group_ids LIKE ? OR lead_group_ids = ? OR lead_group_ids LIKE ? OR lead_group_ids LIKE ?)")
        params.extend([f"{group_id},%", str(group_id), f"%,{group_id},%", f"%,{group_id}"])

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"SELECT * FROM leads {where_sql} ORDER BY updated_at DESC"
    rows = await db.fetch_all(sql, tuple(params))

    # Словарь названий групп
    groups_list = await db.fetch_all("SELECT id, name FROM lead_groups")
    group_map = {g["id"]: g["name"] for g in groups_list}

    if format == "txt":
        lines = []
        for r in rows:
            if r.get("username"):
                lines.append(f"@{r['username']}")
            elif r.get("phone"):
                lines.append(r["phone"])
            elif r.get("chat_id") and r["chat_id"] > 0:
                lines.append(f"tg://user?id={r['chat_id']}")
        content = "\n".join(lines)
        return PlainTextResponse(
            content=content,
            headers={"Content-Disposition": "attachment; filename=leads_export.txt"}
        )

    # CSV с UTF-8 BOM для безупречного открытия в MS Excel на русском
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow([
        "ID диалога", "Телефон фермы", "Имя", "Фамилия", "Юзернейм",
        "Телефон", "О себе (Био)", "День рождения", "Ссылка на канал", "Название канала", "Заметки", "Группы лидов"
    ])

    for r in rows:
        g_ids = [int(x) for x in (r.get("lead_group_ids") or "").split(",") if x.strip().isdigit()]
        g_names = [group_map.get(gid, str(gid)) for gid in g_ids]
        writer.writerow([
            r.get("chat_id", ""),
            r.get("account_phone", ""),
            r.get("first_name", ""),
            r.get("last_name", ""),
            r.get("username", ""),
            r.get("phone", ""),
            (r.get("bio") or "").replace("\n", " "),
            r.get("birthday", ""),
            r.get("channel_link", ""),
            r.get("channel_title", ""),
            (r.get("notes") or "").replace("\n", " "),
            ", ".join(g_names)
        ])

    csv_data = output.getvalue()
    bom_csv = "\ufeff" + csv_data
    return Response(
        content=bom_csv.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
    )

# Взаимные симпатии Дайвинчика (Хранилище взаимок)
@router.get("/matches")
async def api_get_matches(account_phone: Optional[str] = None, status: Optional[str] = None):
    return await get_leomatch_matches(account_phone=account_phone, status=status)

@router.post("/matches/{match_id}/status")
async def api_set_match_status(match_id: int, req: MatchStatusUpdate):
    await update_match_status(match_id, req.status)
    return {"status": "ok"}

@router.get("/matches/export")
async def api_export_matches(
    account_phone: Optional[str] = None,
    format: str = Query("csv", pattern="^(csv|txt)$")
):
    where = []
    params = []
    if account_phone:
        clean = account_phone.strip().lstrip("+")
        where.append("(account_phone = ? OR account_phone = ?)")
        params.extend([clean, f"+{clean}"])

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    sql = f"SELECT * FROM leomatch_matches {where_sql} ORDER BY created_at DESC"
    rows = await db.fetch_all(sql, tuple(params))

    if format == "txt":
        lines = []
        for r in rows:
            if r.get("lead_username"):
                lines.append(f"@{r['lead_username']}")
            elif r.get("lead_user_id"):
                lines.append(f"tg://user?id={r['lead_user_id']}")
        content = "\n".join(lines)
        return PlainTextResponse(
            content=content,
            headers={"Content-Disposition": "attachment; filename=matches_export.txt"}
        )

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["ID", "Аккаунт фермы", "ID лида", "Юзернейм", "Имя", "Возраст", "Город", "Био", "Статус", "Дата создания"])

    for r in rows:
        writer.writerow([
            r.get("id", ""),
            r.get("account_phone", ""),
            r.get("lead_user_id", ""),
            r.get("lead_username", ""),
            r.get("lead_name", ""),
            r.get("lead_age", ""),
            r.get("lead_city", ""),
            (r.get("lead_bio") or "").replace("\n", " "),
            r.get("status", ""),
            r.get("created_at", "")
        ])

    csv_data = output.getvalue()
    bom_csv = "\ufeff" + csv_data
    return Response(
        content=bom_csv.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=matches_export.csv"}
    )

@router.delete("/matches")
async def api_clear_matches(account_phone: Optional[str] = None):
    if account_phone:
        clean = account_phone.strip().lstrip("+")
        await db.execute("DELETE FROM leomatch_matches WHERE account_phone = ? OR account_phone = ?", (clean, f"+{clean}"))
    else:
        await db.execute("DELETE FROM leomatch_matches")
    return {"status": "ok"}
