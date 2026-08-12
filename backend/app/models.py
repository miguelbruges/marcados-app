import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RolUsuario(str, enum.Enum):
    ADMIN = "admin"
    LIDER = "lider"
    ENCARGADO = "encargado"
    CONSOLIDACION = "consolidacion"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    rol: Mapped[RolUsuario] = mapped_column(default=RolUsuario.LIDER)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Catalogo(Base):
    """Valores de catálogo reutilizables (estado, género, cómo llegó, fuente de datos...).

    Un solo modelo genérico en vez de una tabla por tipo — los catálogos de este
    proyecto son listas cortas de texto, no ameritan una tabla cada una.
    """

    __tablename__ = "catalogos"
    __table_args__ = (UniqueConstraint("tipo", "valor", name="uq_catalogo_tipo_valor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(60), index=True)
    valor: Mapped[str] = mapped_column(String(120))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class AreaServicio(Base):
    __tablename__ = "areas_servicio"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    personas: Mapped[list["PersonaArea"]] = relationship(back_populates="area")


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Identidad técnica estable (formato MAR-000001). NUNCA usar `id` autoincremental
    # ni ningún "No." de fila como identificador de negocio — ver decisiones-diseño.
    id_unico: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    nombres: Mapped[str] = mapped_column(String(120))
    apellidos: Mapped[str] = mapped_column(String(120))

    fecha_nacimiento: Mapped[date | None] = mapped_column(Date, nullable=True)
    edad_manual: Mapped[int | None] = mapped_column(nullable=True)  # respaldo si no hay fecha exacta

    telefono: Mapped[str | None] = mapped_column(String(30), nullable=True)
    correo_electronico: Mapped[str | None] = mapped_column(String(180), nullable=True)
    genero: Mapped[str | None] = mapped_column(String(20), nullable=True)
    estado: Mapped[str | None] = mapped_column(String(40), nullable=True)  # activo/inactivo/fluctuante...
    encargado_lider: Mapped[str | None] = mapped_column(String(120), nullable=True)

    bautizado: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_bautismo: Mapped[date | None] = mapped_column(Date, nullable=True)

    estudio_biblico: Mapped[str | None] = mapped_column(String(60), nullable=True)

    tiene_instagram: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    instagram: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tiene_facebook: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    facebook: Mapped[str | None] = mapped_column(String(120), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)

    contacto_emergencia: Mapped[str | None] = mapped_column(String(120), nullable=True)
    parentesco: Mapped[str | None] = mapped_column(String(60), nullable=True)  # del contacto de emergencia
    telefono_emergencia: Mapped[str | None] = mapped_column(String(30), nullable=True)
    grupo_sanguineo: Mapped[str | None] = mapped_column(String(10), nullable=True)
    eps: Mapped[str | None] = mapped_column(String(120), nullable=True)
    talla: Mapped[str | None] = mapped_column(String(10), nullable=True)

    como_llego: Mapped[str | None] = mapped_column(String(120), nullable=True)
    fuente_datos: Mapped[str | None] = mapped_column(String(60), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    servidor: Mapped[bool] = mapped_column(Boolean, default=False)
    fecha_ingreso: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_inicio_servicio: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Quién invitó a esta persona (otra Persona ya existente en el sistema).
    # Distinto de 'como_llego' (texto libre histórico, ej. "Primo de Cristal",
    # "Staff") — este campo es una referencia estructurada, solo se llena
    # hacia adelante, y alimenta el ranking de invitaciones por período.
    invitado_por_id: Mapped[int | None] = mapped_column(ForeignKey("personas.id"), nullable=True)

    # El semáforo espiritual es un juicio pastoral: lo fija una persona, nunca un
    # cálculo automático de asistencia. Ver principio no negociable del proyecto.
    semaforo_espiritual: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Distingue los registros que llegaron por la migración inicial del Excel
    # (históricos: nunca se les inventa una fecha de ingreso) de los que se
    # crean desde la app en adelante (esos sí reciben fecha_ingreso = hoy).
    registro_historico: Mapped[bool] = mapped_column(Boolean, default=False)

    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    areas: Mapped[list["PersonaArea"]] = relationship(back_populates="persona")
    asistencias: Mapped[list["Asistencia"]] = relationship(back_populates="persona")
    seguimientos: Mapped[list["Seguimiento"]] = relationship(back_populates="persona")
    invitado_por: Mapped["Persona | None"] = relationship(remote_side="Persona.id")

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()

    @property
    def invitado_por_nombre(self) -> str | None:
        return self.invitado_por.nombre_completo if self.invitado_por else None

    @property
    def areas_servicio(self) -> list["AreaServicio"]:
        return [pa.area for pa in self.areas if pa.activo]

    @property
    def ficha_completa_pct(self) -> float:
        from app.services.ficha_completa import calcular_ficha_completa  # evita import circular

        pct, _ = calcular_ficha_completa(self)
        return pct

    @property
    def datos_faltantes(self) -> list[str]:
        from app.services.ficha_completa import calcular_ficha_completa  # evita import circular

        _, faltantes = calcular_ficha_completa(self)
        return faltantes


class PersonaArea(Base):
    """Varios-a-varios: una persona puede servir en más de un área a la vez."""

    __tablename__ = "persona_area"
    __table_args__ = (UniqueConstraint("persona_id", "area_servicio_id", name="uq_persona_area"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey("personas.id"))
    area_servicio_id: Mapped[int] = mapped_column(ForeignKey("areas_servicio.id"))
    fecha_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    persona: Mapped["Persona"] = relationship(back_populates="areas")
    area: Mapped["AreaServicio"] = relationship(back_populates="personas")


class Actividad(Base):
    """Plantilla de actividad recurrente (p.ej. 'Culto Juvenil', 'Célula')."""

    __tablename__ = "actividades"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120), unique=True)
    tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    # Si sus eventos cuentan como "oportunidad de asistencia" para el
    # semáforo operativo — por defecto solo el encuentro semanal principal,
    # para no penalizar a quien no participa de una actividad de horario o
    # rol específico (p.ej. Escuela de Servidores). Editable por admin
    # (PATCH /actividades/{id}), sección 15/21 del handoff.
    cuenta_para_semaforo: Mapped[bool] = mapped_column(Boolean, default=True)

    eventos: Mapped[list["Evento"]] = relationship(back_populates="actividad")


class Evento(Base):
    """Ocurrencia concreta y fechada de una actividad — a esto se asocia la asistencia."""

    __tablename__ = "eventos"
    __table_args__ = (UniqueConstraint("actividad_id", "fecha", name="uq_evento_actividad_fecha"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    actividad_id: Mapped[int] = mapped_column(ForeignKey("actividades.id"))
    nombre: Mapped[str] = mapped_column(String(160))
    fecha: Mapped[date] = mapped_column(Date, index=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    actividad: Mapped["Actividad"] = relationship(back_populates="eventos")
    asistencias: Mapped[list["Asistencia"]] = relationship(back_populates="evento")


class Asistencia(Base):
    """La asistencia se relaciona con la persona por ID, nunca por texto libre."""

    __tablename__ = "asistencias"
    __table_args__ = (UniqueConstraint("persona_id", "evento_id", name="uq_asistencia_persona_evento"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey("personas.id"), index=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("eventos.id"), index=True)
    presente: Mapped[bool] = mapped_column(Boolean, default=True)
    registrado_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    registrado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    persona: Mapped["Persona"] = relationship(back_populates="asistencias")
    evento: Mapped["Evento"] = relationship(back_populates="asistencias")
    registrado_por: Mapped["Usuario | None"] = relationship(foreign_keys=[registrado_por_id])

    @property
    def persona_nombre(self) -> str:
        return self.persona.nombre_completo


class Seguimiento(Base):
    """Registro de seguimiento pastoral. Es un log humano, no una conclusión automática."""

    __tablename__ = "seguimientos"

    id: Mapped[int] = mapped_column(primary_key=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey("personas.id"), index=True)
    fecha: Mapped[date] = mapped_column(Date, default=date.today)
    tipo: Mapped[str | None] = mapped_column(String(60), nullable=True)  # llamada/visita/mensaje...
    notas: Mapped[str] = mapped_column(Text)
    requiere_atencion: Mapped[bool] = mapped_column(Boolean, default=False)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    persona: Mapped["Persona"] = relationship(back_populates="seguimientos")

    @property
    def persona_nombre(self) -> str:
        return self.persona.nombre_completo


class Bitacora(Base):
    """Auditoría de cambios: quién tocó qué campo, con qué valor anterior y
    nuevo, y cuándo. Se escribe, nunca se edita ni se borra desde la app."""

    __tablename__ = "bitacora"

    id: Mapped[int] = mapped_column(primary_key=True)
    tabla: Mapped[str] = mapped_column(String(60), index=True)
    registro_id: Mapped[int] = mapped_column(index=True)
    campo: Mapped[str] = mapped_column(String(80))
    valor_anterior: Mapped[str | None] = mapped_column(Text, nullable=True)
    valor_nuevo: Mapped[str | None] = mapped_column(Text, nullable=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), nullable=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class PlantillaExcel(Base):
    """El libro real usado como plantilla de exportación (sección 16.2).
    Se guarda en la base — no en el disco del servidor — porque el disco
    de Render es efímero (se pierde en cada deploy) y el administrador no
    tiene forma de subir un archivo por SSH. Se sube una sola vez desde
    Administración y sobrevive a cualquier redeploy. Solo existe una fila:
    subir una nueva reemplaza la anterior."""

    __tablename__ = "plantilla_excel"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_archivo: Mapped[str] = mapped_column(String(255))
    contenido: Mapped[bytes] = mapped_column(LargeBinary)
    actualizado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
