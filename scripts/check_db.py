"""Comprobar conexión y esquema sin mostrar credenciales."""

import pymysql

from app.database import connection


def main():
    try:
        with connection() as conn, conn.cursor() as cursor:
            cursor.execute("SELECT sample_id, mq2, mq135, mq9, uv, rssi, snr FROM measurements LIMIT 1")
            cursor.execute("SELECT id FROM stations LIMIT 1")
    except pymysql.MySQLError as exc:
        code = exc.args[0]
        if code == 2003:
            message = "El servidor MySQL no respondió. Revisa acceso al host y puerto de .env."
        elif code == 1045:
            message = "MySQL rechazó el usuario o la contraseña de .env."
        elif code in (1054, 1146):
            message = "Faltan tablas o columnas. Ejecuta python -m scripts.init_db."
        else:
            message = "No se pudo verificar la base. Revisa su configuración y permisos."
        print(f"{message} Código MySQL: {code}")
        return 1
    print("Conexión MySQL y esquema de EcoRed disponibles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
