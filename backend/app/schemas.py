from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr


# --- Auth ---
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str


# --- Usuarios (gestión, solo admin) ---
class UsuarioCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: str = "lider"  # admin | lider | encargado | consolidacion


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool


class AreaServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


# --- Persona ---
class PersonaBase(BaseModel):
    nombres: str
    apellidos: str
    fecha_nacimiento: date | None = None
    edad_manual: int | None = None
    telefono: str | None = None
    correo_electronico: str | None = None
    genero: str | None = None
    estado: str | None = None
    encargado_lider: str | None = None
    bautizado: bool = False
    fecha_bautismo: date | None = None
    estudio_biblico: str | None = None
    tiene_instagram: bool | None = None
    instagram: str | None = None
    tiene_facebook: bool | None = None
    facebook: str | None = None
    direccion: str | None = None
    contacto_emergencia: str | None = None
    parentesco: str | None = None
    telefono_emergencia: str | None = None
    grupo_sanguineo: str | None = None
    eps: str | None = None
    talla: str | None = None
    como_llego: str | None = None
    fuente_datos: str | None = None
    notas: str | None = None
    servidor: bool = False
    fecha_ingreso: date | None = None
    fecha_inicio_servicio: date | None = None
    invitado_por_id: int | None = None


class PersonaCreate(PersonaBase):
    pass


class PersonaUpdate(BaseModel):
    """Todos los campos opcionales — PATCH solo aplica lo que venga."""

    nombres: str | None = None
    apellidos: str | None = None
    fecha_nacimiento: date | None = None
    edad_manual: int | None = None
    telefono: str | None = None
    correo_electronico: str | None = None
    genero: str | None = None
    estado: str | None = None
    encargado_lider: str | None = None
    bautizado: bool | None = None
    fecha_bautismo: date | None = None
    estudio_biblico: str | None = None
    tiene_instagram: bool | None = None
    instagram: str | None = None
    tiene_facebook: bool | None = None
    facebook: str | None = None
    direccion: str | None = None
    contacto_emergencia: str | None = None
    parentesco: str | None = None
    telefono_emergencia: str | None = None
    grupo_sanguineo: str | None = None
    eps: str | None = None
    talla: str | None = None
    como_llego: str | None = None
    fuente_datos: str | None = None
    notas: str | None = None
    servidor: bool | None = None
    fecha_ingreso: date | None = None
    fecha_inicio_servicio: date | None = None
    invitado_por_id: int | None = None
    activo: bool | None = None


class PersonaOut(PersonaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    id_unico: str
    activo: bool
    semaforo_espiritual: str | None = None
    registro_historico: bool = False
    ficha_completa_pct: float = 100.0
    datos_faltantes: list[str] = []
    invitado_por_nombre: str | None = None
    areas_servicio: list[AreaServicioOut] = []


class MarcarServidorRequest(BaseModel):
    fecha_inicio_servicio: date | None = None  # si no se manda, el backend usa hoy


class PersonaAreasUpdate(BaseModel):
    """Reemplaza por completo el conjunto de áreas de servicio de la persona
    (selección múltiple desde la ficha) — no es un PATCH incremental."""

    area_ids: list[int]


class PersonaResumen(BaseModel):
    id: int
    id_unico: str
    nombre_completo: str

    model_config = ConfigDict(from_attributes=True)


class FichaIncompletaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    id_unico: str
    nombre_completo: str
    ficha_completa_pct: float
    datos_faltantes: list[str]


class FusionarDuplicadosRequest(BaseModel):
    """Cuál ficha se conserva y cuál se absorbe. Las dos van explícitas: el
    servidor nunca elige por su cuenta a quién archivar."""

    conservar_id: int
    absorber_id: int


class InvitacionRankingOut(BaseModel):
    persona_id: int
    id_unico: str
    nombre_completo: str
    cantidad: int


class PersonaAlertasOut(BaseModel):
    """Alertas OPERATIVAS (sección 21 del handoff): nunca una conclusión
    espiritual — nivel_asistencia es aparte de semaforo_espiritual, que
    siempre lo fija una persona a mano."""

    id: int
    id_unico: str
    nombre_completo: str
    asistencias_ventana: int
    reuniones_evaluables_ventana: int
    porcentaje_asistencia: float | None
    nivel_asistencia: str
    inasistencias_consecutivas: int
    ficha_completa_pct: float
    datos_faltantes: list[str]


# --- Matching ---
class MatchCandidatoOut(BaseModel):
    persona_id: int
    id_unico: str
    nombre_completo: str
    score: float


class MatchResponse(BaseModel):
    confianza: str
    candidatos: list[MatchCandidatoOut]


# --- Actividades ---
class ActividadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    tipo: str | None = None
    activo: bool
    cuenta_para_semaforo: bool


class ActividadCreate(BaseModel):
    nombre: str
    tipo: str | None = None
    cuenta_para_semaforo: bool = True


class ActividadUpdate(BaseModel):
    nombre: str | None = None
    tipo: str | None = None
    activo: bool | None = None
    cuenta_para_semaforo: bool | None = None


# --- Eventos / Asistencia ---
class EventoCreate(BaseModel):
    actividad_id: int
    nombre: str
    fecha: date


class EventoOut(EventoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --- Importación de lista pegada (WhatsApp u otro texto libre) ---
class ImportarPreviewRequest(BaseModel):
    actividad_id: int
    fecha: date
    texto: str
    nombre_evento: str | None = None  # para "Otro": nombre libre en vez de la fecha sola


class ImportarFilaOut(BaseModel):
    texto_original: str
    confianza: str
    candidatos: list[MatchCandidatoOut]


class ImportarPreviewResponse(BaseModel):
    evento: EventoOut
    filas: list[ImportarFilaOut]


class ImportarConfirmarRequest(BaseModel):
    evento_id: int
    persona_ids: list[int]


class ImportarConfirmarResponse(BaseModel):
    guardados: int
    ya_registrados: int


class AsistenciaCreate(BaseModel):
    persona_id: int
    evento_id: int
    presente: bool = True


class AsistenciaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    persona_id: int
    persona_nombre: str
    evento_id: int
    presente: bool
    registrado_en: datetime
    total_asistencias_persona: int


# --- Catálogos / Áreas ---
class CatalogoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tipo: str
    valor: str


# --- Seguimiento ---
class SeguimientoCreate(BaseModel):
    persona_id: int
    tipo: str | None = None
    fecha: date | None = None  # si no se manda, el backend usa hoy
    notas: str
    requiere_atencion: bool = False


class SeguimientoOut(SeguimientoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha: date
    created_at: datetime


class SeguimientoRequiereAtencionOut(BaseModel):
    """Vista agregada entre personas — alimenta el centro de alertas del
    panel. Sigue siendo lo que un humano escribió a mano; no es un cálculo."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    persona_id: int
    persona_nombre: str
    fecha: date
    tipo: str | None
    notas: str
