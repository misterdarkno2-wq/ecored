from collections.abc import Iterator
from contextlib import contextmanager

import pymysql
from pymysql.cursors import DictCursor

from app.config import get_settings


@contextmanager
def connection() -> Iterator[pymysql.Connection]:
    """Una conexión por operación; nunca compartir conexiones entre hilos."""
    settings = get_settings()
    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password.get_secret_value(),
        database=settings.db_name,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
        connect_timeout=5,
        read_timeout=10,
        write_timeout=10,
        init_command="SET time_zone = '+00:00'",
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
