"""Punto de entrada para Vercel.

Vercel ejecuta la app como función serverless: no hay un proceso uvicorn
corriendo todo el tiempo, sino que se levanta uno al llegar un pedido y se
apaga cuando no hay tráfico. Despertar tarda 1-3s en vez de los 30-60s de
la capa gratuita de Render — que es el motivo de todo esto.

Este archivo NO reemplaza a app/main.py: solo lo importa. La app es la
misma en Render y en Vercel, y los 210 tests siguen corriendo contra
app.main sin enterarse de que esto existe.
"""

import sys
from pathlib import Path

# El código vive en backend/, no en la raíz. Vercel ejecuta este archivo
# desde api/, así que hay que poner backend/ en el path antes de importar.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402  (tiene que ir después del sys.path)

# Vercel busca una variable ASGI llamada 'app' en este módulo.
__all__ = ["app"]
