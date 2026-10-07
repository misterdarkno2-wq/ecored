"""Crear tablas en una base existente: python -m scripts.init_db."""

from pathlib import Path

from app.database import connection


def migrate_receiver_fields(cursor):
    # Las versiones anteriores ya pueden tener mediciones. Añadir columnas preserva esas filas.
    cursor.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'measurements'"
    )
    existing = {row["COLUMN_NAME"] for row in cursor.fetchall()}
    additions = {
        "sample_id": "VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL",
        "mq2": "SMALLINT UNSIGNED NULL",
        "mq135": "SMALLINT UNSIGNED NULL",
        "mq9": "SMALLINT UNSIGNED NULL",
        "uv": "SMALLINT UNSIGNED NULL",
        "rssi": "DOUBLE NULL",
        "snr": "DOUBLE NULL",
    }
    for name, definition in additions.items():
        if name not in existing:
            cursor.execute(f"ALTER TABLE measurements ADD COLUMN {name} {definition}")
    cursor.execute("SHOW INDEX FROM measurements WHERE Key_name = 'uq_station_sample'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE measurements ADD UNIQUE KEY uq_station_sample (station_id, sample_id)")


def main():
    schema = (Path(__file__).resolve().parents[1] / "sql" / "schema.sql").read_text(encoding="utf-8")
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute("SELECT GET_LOCK(CONCAT(DATABASE(), '_ecored_schema'), 30) AS acquired")
        if cursor.fetchone()["acquired"] != 1:
            raise RuntimeError("No se pudo bloquear la inicialización del esquema")
        try:
            for statement in schema.split(";"):
                if statement.strip():
                    cursor.execute(statement)
            migrate_receiver_fields(cursor)
        finally:
            cursor.execute("SELECT RELEASE_LOCK(CONCAT(DATABASE(), '_ecored_schema'))")
    print("Tablas de EcoRed listas. Estación EST-001 registrada.")


if __name__ == "__main__":
    main()
