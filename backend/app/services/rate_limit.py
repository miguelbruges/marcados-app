"""Freno simple a intentos repetidos de login (auditoría 2026-08-14: no
había ningún límite — con datos de menores de edad detrás del login, vale
la pena). En memoria del proceso: uvicorn corre un solo worker acá (ver
`startCommand` en render.yaml), así que no hace falta nada distribuido
(Redis, etc.) para esta escala.

Por email, no por IP: el objetivo es proteger las cuentas conocidas del
equipo (pocas, todas con email fijo), no mitigar tráfico masivo — y por IP
sería menos preciso acá, ya que Render está detrás de un proxy.
"""

import time
from collections import defaultdict

MAX_INTENTOS = 5
VENTANA_SEGUNDOS = 15 * 60
BLOQUEO_SEGUNDOS = 15 * 60

_intentos_fallidos: dict[str, list[float]] = defaultdict(list)
_bloqueados_hasta: dict[str, float] = {}


def registrar_intento_fallido(clave: str) -> None:
    ahora = time.time()
    vigentes = [t for t in _intentos_fallidos[clave] if ahora - t < VENTANA_SEGUNDOS]
    vigentes.append(ahora)
    _intentos_fallidos[clave] = vigentes
    if len(vigentes) >= MAX_INTENTOS:
        _bloqueados_hasta[clave] = ahora + BLOQUEO_SEGUNDOS


def segundos_bloqueado(clave: str) -> float | None:
    """None si no está bloqueado; si no, los segundos que faltan."""
    hasta = _bloqueados_hasta.get(clave)
    if hasta is None:
        return None
    restante = hasta - time.time()
    if restante <= 0:
        limpiar(clave)
        return None
    return restante


def limpiar(clave: str) -> None:
    _intentos_fallidos.pop(clave, None)
    _bloqueados_hasta.pop(clave, None)


def limpiar_todo() -> None:
    """Para tests — el estado es del proceso, no de cada request."""
    _intentos_fallidos.clear()
    _bloqueados_hasta.clear()
