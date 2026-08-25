from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from . import config

_pool: ThreadedConnectionPool | None = None


def get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        kwargs: dict = {"minconn": 1, "maxconn": 10, "options": "-c search_path=lab,public"}
        if config.DATABASE_URL:
            kwargs["dsn"] = config.DATABASE_URL
        else:
            kwargs.update(
                host=config.DB_HOST,
                port=config.DB_PORT,
                dbname=config.DB_NAME,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
            )
        _pool = ThreadedConnectionPool(**kwargs)
    return _pool


@contextmanager
def conexion(escribir: bool = True):
    """Entrega una conexión del pool. Con escribir=False SIEMPRE hace rollback
    al final, aunque no haya errores — es la garantía real de que un
    "preview" no puede dejar nada escrito por accidente."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
        if escribir:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


@contextmanager
def cursor_dict(conn):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield cur
    finally:
        cur.close()
