import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

# En un servidor normal (Render) hay UN proceso de larga vida y el pool de
# conexiones de SQLAlchemy es justo lo que se quiere: abre unas pocas
# conexiones y las reutiliza.
#
# En serverless (Vercel) no: cada invocación puede ser un proceso nuevo y
# efímero, así que el pool nunca se reutiliza — solo deja conexiones abiertas
# que nadie cierra. Con suficiente tráfico eso agota el límite de conexiones
# de Postgres y la app empieza a dar errores que no se parecen en nada a la
# causa real. NullPool abre y cierra en cada pedido, y el pooling de verdad
# lo hace Supabase (hay que usar su connection string de "Transaction
# pooler", puerto 6543, no la conexión directa).
#
# VERCEL=1 la define Vercel sola en sus despliegues. Fuera de ahí esta rama
# no se toca, así que Render y los tests se comportan exactamente igual que
# antes.
if os.getenv("VERCEL"):
    engine = create_engine(settings.database_url, connect_args=connect_args, poolclass=NullPool)
else:
    engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
