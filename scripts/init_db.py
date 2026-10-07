"""Crear tablas en una base existente: python -m scripts.init_db."""

from pathlib import Path

from app.database import connection


def main():
    schema = (Path(__file__).resolve().parents[1] / "sql" / "schema.sql").read_text(encoding="utf-8")
    with connection() as conn, conn.cursor() as cursor:
        for statement in schema.split(";"):
            if statement.strip():
                cursor.execute(statement)
    print("Tablas de EcoRed listas. Estación EST-001 registrada.")


if __name__ == "__main__":
    main()
