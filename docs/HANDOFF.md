# Traspaso entre sesiones — leer esto primero

Este archivo existe porque las conversaciones se borran y el contenedor de
trabajo es efímero: lo único que sobrevive es el repositorio. Si estás
retomando MARCADOS en un chat nuevo, empezá acá y después mirá
`README.md` (cómo funciona cada cosa) y `docs/ESTADO.md` (checklist de
avance).

Última actualización: **2026-08-27**, sobre `master` en `23f1386`.

---

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| Repositorio | `github.com/miguelbruges/marcados-app`, rama `master` |
| App en vivo | `https://marcados-app.onrender.com` (Render + Supabase/Postgres) |
| Datos reales | ~120 jóvenes, en uso por el equipo de consolidación |
| Tests | 210 en el backend, todos pasando (`cd backend && pytest -q`) |

El despliegue es automático: **push a `master` despliega a producción**.
No hay staging. Cada push toca la app que el equipo usa de verdad.

---

## 2. Las reglas que no se negocian

Estas salieron de decisiones explícitas del usuario y se sostuvieron toda
la vida del proyecto. Si algo las contradice, está mal aunque funcione.

**El semáforo de asistencia NUNCA es una conclusión espiritual.** Es un
dato operativo: cuánto asistió alguien en una ventana de días, para saber
a quién buscar. La lectura pastoral es `semaforo_espiritual`, un campo
aparte que **solo** fija una persona a mano. Nunca se calcula, nunca se
infiere, y los dos no se mezclan ni se llaman parecido.

**No se inventan datos.** Si el Excel no traía un valor, queda vacío y
—cuando hace falta decidir— se crea un `Seguimiento` marcado
`requiere_atencion` para que lo resuelva un humano. Nada de rellenar con
suposiciones.

**Una celda en blanco no borra lo que ya está cargado.** Al importar, un
campo vacío significa "no lo toques", no "ponelo en nulo". Única excepción:
`servidor` y `bautizado`, que son NOT NULL y donde el blanco sí es `False`.

**Nada se fusiona ni se borra solo.** Juntar dos fichas es siempre decisión
humana (dos jóvenes pueden llamarse igual de verdad), y fusionar archiva la
ficha absorbida, nunca la elimina. Todo queda en Bitácora.

**Son datos personales de menores de edad.** El Excel real y la plantilla
nunca van al repositorio, y tampoco los nombres y teléfonos reales en
código, comentarios, tests o documentación: los ejemplos usan nombres
inventados con la misma forma que el caso real (se limpió el 2026-08-27;
habían quedado varios en `duplicados.py`, sus tests y el README). El acceso pastoral (seguimiento, semáforo,
duplicados) es solo admin/líder/encargado — el equipo de consolidación ve
la ficha general, no lo pastoral.

---

## 3. Trampas que ya nos mordieron

Cada una costó tiempo real. Están acá para no repetirlas.

**Un cambio subido no es un cambio visto.** `index.html` pedía los JS sin
versión, así que el navegador servía la copia vieja y el cambio parecía no
haberse hecho. Ahora todo va con `?v=N`. **Al tocar `css/` o `js/`, subí
ese número en `index.html` Y en `service-worker.js` (tienen que coincidir).**

**Alembic no siempre corre en el deploy de Render.** Pasó al menos dos
veces, sin error visible. `app/services/schema_guard.py` es la red de
seguridad que aplica el cambio en SQL directo al arrancar. No reemplaza a
Alembic: seguí creando la migración normal. Causa raíz **sin diagnosticar**
(hace falta ver los logs de Render).

**openpyxl borra los valores calculados de las fórmulas.** Al reguardar la
plantilla, de 2333 fórmulas quedaban 0 con valor. Por eso el export se
marca para recalcular al abrir. **No restaurar los valores viejos**: están
calculados sobre datos anteriores y se leerían como cifras actuales siendo
falsas.

**`token_set_ratio` no sirve para decidir identidad.** Da 100 cuando un
nombre está contenido en otro, así que una ficha "Sofia" empataba con tres
Sofías distintas. Para buscar está bien; para afirmar que dos fichas son la
misma persona, no. Ver sección 5.

**Mismo teléfono no es la misma persona.** En una familia se comparte el
celular: hay hermanas reales en la base compartiéndolo.

**El proxy de red del entorno bloquea `marcados-app.onrender.com`** (403 en
el túnel CONNECT; bloquea casi todo salvo GitHub y los registros de
paquetes). **No se puede verificar producción desde el agente ni hacer
cambios contra la base en vivo.** Todo lo que toque producción lo hace el
usuario desde la app. Es política del entorno: no intentes rodearla.

---

## 4. Cómo se trabaja acá

Flujo que funcionó todo el proyecto:

1. Cambio en el backend → `pytest -q` (la suite completa, no solo el archivo).
2. Cambio en el frontend → `node --check` y **verificación real con
   Playwright** contra un servidor local con datos sembrados.
   `backend/scripts/seed_dev.py` crea `admin@marcadosapp.dev / admin1234`.
3. Limpiar (matar uvicorn, borrar `marcados_dev.db`).
4. Commit en español, explicando **por qué**, no solo qué.
5. `git push -u origin master`.

Los mensajes de commit de este repo son largos a propósito: cuentan qué
problema real resolvían. Vale la pena leerlos con `git log` antes de tocar
un área que no conocés.

---

## 5. Qué se hizo en la última sesión (2026-08-24 al 27)

**Excel: un solo flujo de importación.** Antes había dos pantallas opuestas
("Cargar datos iniciales", que se negaba si ya había gente, y "Actualizar
desde Excel", que nunca creaba). Ahora `POST /migracion/importar` reconcilia
por ID único: crea a quien falta y actualiza a quien cambió, en la misma
subida. Administración → Excel quedó en dos opciones (Descargar / Importar)
más un link chico a la plantilla.

**Asistencia que se perdía en silencio.** Al pegar una lista de WhatsApp,
las líneas sin coincidencia automática quedaban con "Ignorar" marcado y se
guardaban así sin avisar: de 30+ nombres solo entraban las coincidencias
exactas. Ahora se avisa antes de guardar y se informa cuántas se ignoraron.
**Este era el bug detrás de "se tomó asistencia pero no se refleja".**

**Semáforo:** el mínimo de reuniones para asignar color bajó de 2 a 1 (con
encuentro semanal, exigir 2 dejaba períodos enteros sin evaluar) y se quitó
la pestaña de 7 días, que estructuralmente nunca tenía datos.

**Calendario en Asistencia:** elegir un día y ver/editar quién asistió, sin
tener que iniciar un registro nuevo.

**Alertas:** la pantalla usaba una clase de lista que solo está estilada
dentro de otras pantallas, así que caía al estilo por defecto del navegador
(viñetas, enlaces azules). Rediseñada, cada sección explica qué significa,
y —lo importante— **ahora se pueden resolver**: antes la marca "requiere
atención" se podía poner pero no sacar, y el contador quedó clavado en 99+.

**Fichas duplicadas:** detección y fusión (Jóvenes → Posibles duplicados).
Ver sección 6, porque tiene una lección importante.

**Ficha:** servidor y bautizado salieron de la vista de lectura y ahora
aparecen al tocar "Editar"; teléfono, teléfono de emergencia y correo son
tocables (`tel:` / `mailto:`) — la app se usa desde el celular en medio de
una reunión.

**"Ver la app como…"** (Administración): el admin puede mirar la pantalla
tal cual la ve un líder, encargado o consolidación. Cambia solo lo que se
muestra, no los permisos — es seguro porque únicamente puede esconder
interfaz, nunca agregarla.

---

## 6. La lección de los duplicados

Vale la pena leerla entera antes de tocar `app/services/duplicados.py`.

La primera versión del detector se corrió sobre los 120 jóvenes reales
**antes** de usarlo. Encontró 7 grupos y **6 eran personas distintas**:
juntaba a una joven con dos hermanas de otro apellido (comparten celular),
a cuatro chicas con el mismo nombre de pila y apellidos distintos, y a una
ficha cuyo nombre incluía "hermano de …" con la persona nombrada ahí.
Fusionar cualquiera habría borrado el historial de alguien real.

Tres fallas, todas con test:

1. **Encadenaba por transitividad** (union-find): bastaba que A se pareciera
   a B y B a C para meter a A con C. Ahora un grupo solo se forma si todos
   sus integrantes se parecen entre sí.
2. **Usaba `token_set_ratio`** (ver sección 3).
3. **El puntaje solo no separa los casos**: "Santiago Ramirez" vs "Santiago
   Gomez" da 80 y son distintos; "Maria Paula Mendez" vs "…Mendez Navarro"
   da 81.8 y es la misma. 1.8 puntos no sirven de corte. Se exige además que
   **un nombre contenga al otro**: la diferencia real es que en un caso falta
   un apellido y en el otro los apellidos se contradicen.

Con eso, sobre los mismos 120 queda **un solo grupo y es real**: la misma
persona cargada dos veces con el nombre escrito distinto (MAR-000026 y
MAR-000132), mismo teléfono.

(Los nombres reales quedan fuera de este archivo a propósito: son datos de
menores y esto es un repositorio. Los IDs alcanzan para encontrarlos en la
app.)

**La lección general:** correr una heurística nueva contra los datos reales
antes de dejar que alguien actúe sobre ella. Los tests sintéticos pasaban.

---

## 7. Pendiente / sin cerrar

**El duplicado real sigue sin fusionar.** MAR-000026 / MAR-000132. Es un
trámite de tres toques en Jóvenes → Posibles duplicados, pero lo tiene que
hacer el usuario: el agente no llega a producción.

**La plantilla de Excel en producción puede ser la equivocada.** Se preparó
una versión limpia (sin los 120 registros reales ni la hoja de respaldo con
PII duplicada) y se le envió al usuario, pero la evidencia del export que
mandó después sugiere que subió la original. **Sin confirmar.** Si el export
trae 120 filas de datos viejos o una hoja `Z_RESPALDO Jovenes`, es esa.

**"La exportación está mal" nunca se confirmó del todo.** Se midió que
openpyxl borra los valores calculados y se forzó el recálculo al abrir,
pero el archivo que el usuario reportó **ya tenía** esa marca. La sospecha
es que lo abrió desde la vista previa del celular, que no recalcula. Falta
que confirme abriéndolo en Excel de verdad.

**Duplicados que la nueva regla no ve.** Es deliberadamente conservadora:
prefiere dejar pasar uno real antes que juntar dos personas distintas. Si
el usuario ve repetidos que la pantalla no marca, ahí hay que ajustar — con
datos concretos, no a ojo.

El resto de pendientes de largo plazo está en `docs/ESTADO.md`.

---

## 8. Cosas que el usuario dejó dichas

- Prefiere que le digan las cosas directo, incluidos los errores propios.
- No quiere pantallas abarrotadas: varias veces pidió juntar o quitar
  opciones ("¿para qué tantos?").
- Cuando algo se propone con opciones múltiples y no le sirve, las descarta
  y dice su propio diseño. Conviene proponer poco y escuchar.
- El público real son líderes usando el celular en medio de una reunión:
  todo lo que ahorre toques ahí vale más que una función nueva.
