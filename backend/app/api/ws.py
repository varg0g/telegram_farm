from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.telegram.events_dispatcher import broadcaster
from app.core.logger import logger

router = APIRouter(tags=["websocket"])

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    broadcaster.add(websocket)
    logger.debug("Клиент подключился к WebSocket")
    try:
        while True:
            # Слушаем ping-сообщения от клиента для поддержания соединения
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.remove(websocket)
        logger.debug("Клиент отключился от WebSocket")
    except Exception as e:
        broadcaster.remove(websocket)
        logger.debug(f"Ошибка в WebSocket: {e}")
