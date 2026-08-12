from unittest.mock import AsyncMock, patch


def _payload(chat_id, texto):
    return {"message": {"chat": {"id": chat_id}, "text": texto}}


def test_webhook_con_token_incorrecto_da_404(client):
    resp = client.post("/telegram/webhook/token-equivocado", json=_payload(1, "/ayuda"))
    assert resp.status_code == 404


def test_webhook_sin_token_configurado_da_404(client):
    from app import config

    original = config.settings.telegram_bot_token
    config.settings.telegram_bot_token = None
    try:
        resp = client.post("/telegram/webhook/cualquiera", json=_payload(1, "/ayuda"))
        assert resp.status_code == 404
    finally:
        config.settings.telegram_bot_token = original


def test_webhook_con_token_correcto_procesa_y_responde(client):
    from app import config

    original = config.settings.telegram_bot_token
    config.settings.telegram_bot_token = "token-secreto-de-prueba"
    try:
        with patch("app.routers.telegram._enviar_respuesta", new_callable=AsyncMock) as mock_enviar:
            resp = client.post(
                "/telegram/webhook/token-secreto-de-prueba",
                json=_payload(999, "/ayuda"),
            )
            assert resp.status_code == 200
            mock_enviar.assert_called_once()
            args = mock_enviar.call_args.args
            assert args[0] == "999"
            assert "MARCADOS" in args[1]
    finally:
        config.settings.telegram_bot_token = original


def test_webhook_ignora_updates_sin_mensaje(client):
    from app import config

    original = config.settings.telegram_bot_token
    config.settings.telegram_bot_token = "token-secreto-de-prueba"
    try:
        resp = client.post("/telegram/webhook/token-secreto-de-prueba", json={"update_id": 1})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
    finally:
        config.settings.telegram_bot_token = original
