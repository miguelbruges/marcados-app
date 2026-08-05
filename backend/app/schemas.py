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


# --- Persona ---
class PersonaBase(BaseModel):
    nombres: str
    apellidos: str
    fecha_nacimiento: date | None = None
    edad_manual: int | None = None
    telefono: str | None = None
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


class PersonaOut(PersonaBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    id_unico: str
    activo: bool
    semaforo_espiritual: str | None = None


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
