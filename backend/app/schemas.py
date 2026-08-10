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
    instagram: str | None = None
    facebook: str | None = None
    direccion: str | None = None
    contacto_emergencia: str | None = None
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
    instagram: str | None = None
    facebook: str | None = None
    direccion: str | None = None
    contacto_emergencia: str | None = None
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
    activo: bool | None = None


class PersonaOut(PersonaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    id_unico: str
    activo: bool
    semaforo_espiritual: str | None = None
    registro_historico: bool = False


class MarcarServidorRequest(BaseModel):
    fecha_inicio_servicio: date | None = None  # si no se manda, el backend usa hoy


class PersonaResumen(BaseModel):
    id: int
    id_unico: str
    nombre_completo: str

    model_config = ConfigDict(from_attributes=True)


# --- Matching ---
class MatchCandidatoOut(BaseModel):
    persona_id: int
    id_unico: str
    nombre_completo: str
    score: float


class MatchResponse(BaseModel):
    confianza: str
    candidatos: list[MatchCandidatoOut]


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
    evento_id: int
    presente: bool
    registrado_en: datetime


# --- Catálogos / Áreas ---
class CatalogoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tipo: str
    valor: str


class AreaServicioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str


# --- Seguimiento ---
class SeguimientoCreate(BaseModel):
    persona_id: int
    tipo: str | None = None
    notas: str
    requiere_atencion: bool = False


class SeguimientoOut(SeguimientoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fecha: date
    created_at: datetime
