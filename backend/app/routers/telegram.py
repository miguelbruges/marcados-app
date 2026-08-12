import logging

import httpx
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.services.telegram_bot import procesar_mensaje

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = logging.getLogger(__name__)


async def _enviar_respuesta(chat_id: str, texto: str) -> None:
    if not settings.telegram_bot_token:
        return
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(url, json={"chat_id": chat_id, "text": texto})
    except httpx.HTTPError:
        # Si Telegram no responde, no tiene sentido devolverle un 500 al
        # propio Telegram — reintentaría reenviando el mismo update. Se
        # registra y listo; el usuario puede volver a escribir el comando.
        logger.exception("No se pudo enviar la respuesta al chat de Telegram %s", chat_id)


@router.post("/webhook/{token}")
async def webhook(token: str, request: Request, db: Session = Depends(get_db)):
    """Telegram manda acá cada mensaje del bot. El token en la URL (no un
    header) es la verificación — igual al que usa la propia API de
    Telegram, así que solo Telegram (o quien conozca el token) puede
    pegarle a esta ruta. 404 en vez de 401/403 para no confirmarle a nadie
    que la ruta existe si el token no coincide."""
    if not settings.telegram_bot_token or token != settings.telegram_bot_token:
        return Response(status_code=404)

    update = await request.json()
    mensaje = update.get("message") or update.get("edited_message")
    if not mensaje or "chat" not in mensaje:
        return {"ok": True}

    chat_id = str(mensaje["chat"]["id"])
    texto = mensaje.get("text", "")

    respuesta = procesar_mensaje(db, chat_id, texto)
    await _enviar_respuesta(chat_id, respuesta)
    return {"ok": True}
