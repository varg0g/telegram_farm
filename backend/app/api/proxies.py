from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import Optional, List, Any
from pydantic import BaseModel
from app.core.security import get_current_admin
from app.services.proxy_service import (
    get_all_proxies, add_single_proxy, batch_add_proxies,
    check_all_proxies, check_single_proxy, delete_proxy, get_proxy_groups,
    create_proxy_group, delete_proxy_group, rename_proxy_group,
    move_proxies_to_group, assign_proxy_to_accounts, allocate_proxies_to_accounts
)
from app.db.database import db

router = APIRouter(prefix="/api/proxies", tags=["proxies"], dependencies=[Depends(get_current_admin)])

class SingleProxyCreate(BaseModel):
    host: str
    port: int
    proto: str = "socks5"
    username: Optional[str] = None
    password: Optional[str] = None
    proxy_group_id: Optional[int] = None

class BatchProxyCreate(BaseModel):
    lines: List[str]
    proxy_group_id: Optional[int] = None
    default_proto: str = "socks5"

class ProxyGroupCreate(BaseModel):
    title: str

class ProxyGroupRename(BaseModel):
    title: str

class MoveProxiesRequest(BaseModel):
    proxy_ids: List[int]
    target_group_id: Optional[int] = None

class AssignProxyRequest(BaseModel):
    proxy_id: Optional[int] = None
    accounts: List[str]

class DistributeProxiesRequest(BaseModel):
    proxy_group_id: Optional[int] = None
    work_group_id: Optional[int] = None
    accounts_per_proxy: int = 1
    accounts: Optional[List[str]] = None

@router.get("")
async def api_list_proxies(proxy_group_id: Optional[int] = None):
    return await get_all_proxies(proxy_group_id=proxy_group_id)

@router.post("")
async def api_add_proxy(req: SingleProxyCreate):
    p_id = await add_single_proxy(
        host=req.host,
        port=req.port,
        proto=req.proto,
        username=req.username,
        password=req.password,
        proxy_group_id=req.proxy_group_id
    )
    return {"status": "ok", "id": p_id}

@router.post("/batch")
async def api_batch_add(req: BatchProxyCreate):
    count = await batch_add_proxies(req.lines, req.proxy_group_id, req.default_proto)
    return {"status": "ok", "added_count": count}

@router.post("/check-all")
async def api_check_all(proxy_group_id: Optional[Any] = Query(None)):
    return await check_all_proxies(proxy_group_id=proxy_group_id)

@router.post("/{proxy_id}/check")
async def api_check_single(proxy_id: int):
    try:
        updated = await check_single_proxy(proxy_id)
        return {"status": "ok", "proxy": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/move-group")
async def api_move_group(req: MoveProxiesRequest):
    count = await move_proxies_to_group(req.proxy_ids, req.target_group_id)
    return {"status": "ok", "moved": count}

@router.post("/assign")
async def api_assign_proxy(req: AssignProxyRequest):
    await assign_proxy_to_accounts(req.proxy_id, req.accounts)
    return {"status": "ok"}

@router.post("/distribute")
async def api_distribute_proxies(req: DistributeProxiesRequest):
    account_names = req.accounts or []
    if not account_names and req.work_group_id:
        acc_rows = await db.fetch_all("SELECT session_name FROM accounts WHERE work_group_id = ?", (req.work_group_id,))
        account_names = [r["session_name"] for r in acc_rows]
    elif not account_names:
        acc_rows = await db.fetch_all("SELECT session_name FROM accounts")
        account_names = [r["session_name"] for r in acc_rows]

    if not account_names:
        raise HTTPException(status_code=400, detail="Нет аккаунтов для распределения")

    mapping = await allocate_proxies_to_accounts(
        account_names=account_names,
        proxy_group_id=req.proxy_group_id,
        accounts_per_proxy=req.accounts_per_proxy,
        work_group_id=req.work_group_id
    )
    return {"status": "ok", "distributed": len(mapping), "mapping": mapping}

@router.delete("/{proxy_id}")
async def api_delete_proxy(proxy_id: int):
    await delete_proxy(proxy_id)
    return {"status": "ok"}

# Группы прокси
@router.get("/groups")
async def api_list_groups():
    return await get_proxy_groups()

@router.post("/groups")
async def api_create_group(req: ProxyGroupCreate):
    g_id = await create_proxy_group(req.title)
    return {"status": "ok", "id": g_id}

@router.post("/groups/{group_id}/rename")
async def api_rename_group(group_id: int, req: ProxyGroupRename):
    await rename_proxy_group(group_id, req.title)
    return {"status": "ok"}

@router.delete("/groups/{group_id}")
async def api_delete_group(group_id: int):
    await delete_proxy_group(group_id)
    return {"status": "ok"}
