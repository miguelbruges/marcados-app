# Arquitectura — MARCADOS app

## Principio no negociable

Una alerta de inasistencia o inactividad nunca se convierte automáticamente
en una conclusión espiritual. El sistema detecta, clasifica y prioriza — las
decisiones pastorales las toma una persona. Por eso `semaforo_espiritual` es
un campo que fija un humano, y `Seguimiento` es un log, no un veredicto
calculado.

## Identidad de las personas

`Persona.id_unico` (formato `MAR-000001`) es la identidad de negocio real.
El `id` autoincremental es solo la clave técnica interna; `Asistencia` y
todo lo demás referencian a la persona por `persona_id` (FK), nunca por
nombre en texto libre ni por un "No." de fila.

## Matching de nombres (`app/matching.py`)

Combina `token_sort_ratio` (tolera orden distinto de palabras) y
`token_set_ratio` (tolera nombres incompletos) de rapidfuzz, sobre texto
normalizado (sin tildes, minúsculas, sin puntuación). Niveles de confianza:

- **ALTA** (≥90 y sin ambigüedad): se puede sugerir con fuerza.
- **MEDIA** (70-89, o dos candidatos con puntajes muy cercanos): requiere
  confirmación del líder.
- **BAJA** (<70): pedir selección manual o considerar que es un joven nuevo.

Regla dura: si los dos mejores candidatos están a menos de 5 puntos de
diferencia, nunca se sube a ALTA aunque el puntaje individual lo permita —
la ambigüedad real (caso "Anthony", dos registros que el proyecto decidió
NO fusionar por contradicciones de datos) siempre baja a selección manual.

## Idempotencia de asistencia

`Asistencia` tiene constraint único `(persona_id, evento_id)`. Registrar dos
veces a la misma persona en el mismo evento no falla ni duplica: devuelve el
registro existente. Lo mismo aplica a crear un `Evento` para una
actividad+fecha que ya existe. Esto es intencional: un líder puede tocar el
mismo nombre dos veces sin que se rompa nada, y el frontend además evita
mostrar duplicados visualmente usando el mismo criterio.

## Por qué no hay una tabla de secuencia para `id_unico`

`Persona.id_unico` ya es una columna única e indexada; el siguiente ID se
calcula como "el mayor número usado + 1" (`app/services/identidad.py`). Una
tabla de contador aparte sería una abstracción sin beneficio real a esta
escala (cientos de registros, no miles por segundo).

## Por qué el frontend no tiene build step

La prioridad explícita del proyecto es que un líder abra un enlace desde su
celular y funcione. HTML/CSS/JS vanilla servido como archivos estáticos
cumple eso sin depender de Node, bundlers ni tiempos de build. Si el
frontend crece lo suficiente como para justificar un framework, ese es un
cambio deliberado a evaluar más adelante, no una decisión por defecto.

## Por qué el frontend se sirve desde el mismo servidor que la API

Al principio el frontend vivía en GitHub Pages y la API en Render — dos
orígenes distintos, comunicándose por CORS. En pruebas reales desde
celular, esa comunicación cross-origin fallaba de forma intermitente y
difícil de diagnosticar a distancia (confirmado: el mismo pedido funcionaba
perfecto simulado desde una máquina con internet normal, pero fallaba
consistentemente desde el celular real, en más de un dispositivo). En vez de
perseguir la causa exacta (podía ser cualquier cosa entre el celular y el
servidor, fuera de nuestro control), se eliminó la necesidad de CORS de
raíz: FastAPI monta `frontend/` como archivos estáticos y sirve todo desde
un solo origen (`app/main.py`, al final, después de las rutas de la API).
GitHub Pages ya no es necesario.
