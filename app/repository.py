from datetime import datetime, timezone

from app.database import connection
from app.models import SENSOR_FIELDS, MeasurementCreate, StationCreate


def serialize_row(row: dict | None) -> dict | None:
    if row:
        for field in ("measured_at", "received_at"):
            if isinstance(row.get(field), datetime):
                row[field] = row[field].replace(tzinfo=timezone.utc)
    return row


def list_stations():
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute("SELECT id, name, location FROM stations ORDER BY name")
        return cursor.fetchall()


def create_station(station: StationCreate):
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "INSERT INTO stations (id, name, location) VALUES (%s, %s, %s)",
            (station.id, station.name, station.location),
        )
    return station.model_dump()


def create_measurement(data: MeasurementCreate):
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "INSERT INTO measurements (station_id, measured_at, temperature, humidity, "
            "pressure, wind_speed, wind_direction, rainfall) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
            (
                data.station_id,
                data.measured_at.replace(tzinfo=None),
                *(getattr(data, field) for field in SENSOR_FIELDS),
            ),
        )
        cursor.execute("SELECT * FROM measurements WHERE id = %s", (cursor.lastrowid,))
        return serialize_row(cursor.fetchone())


def latest(station_id: str):
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "SELECT * FROM measurements WHERE station_id = %s ORDER BY measured_at DESC, id DESC LIMIT 1",
            (station_id,),
        )
        return serialize_row(cursor.fetchone())


def filters(station_id: str, start: datetime | None, end: datetime | None):
    clauses, values = ["station_id = %s"], [station_id]
    for field, op, value in (("measured_at", ">=", start), ("measured_at", "<=", end)):
        if value is not None:
            clauses.append(f"{field} {op} %s")
            values.append(value.astimezone(timezone.utc).replace(tzinfo=None))
    return " AND ".join(clauses), values


def history(station_id: str, start: datetime | None, end: datetime | None, limit: int, offset: int):
    where, values = filters(station_id, start, end)
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) AS total FROM measurements WHERE {where}", values)
        total = cursor.fetchone()["total"]
        cursor.execute(
            f"SELECT * FROM measurements WHERE {where} ORDER BY measured_at DESC, id DESC LIMIT %s OFFSET %s",
            (*values, limit, offset),
        )
        return {
            "items": [serialize_row(row) for row in cursor.fetchall()],
            "total": total,
            "limit": limit,
            "offset": offset,
        }


def summary(station_id: str, start: datetime | None, end: datetime | None):
    where, values = filters(station_id, start, end)
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) AS count, MIN(temperature) AS temperature_min, "
            "MAX(temperature) AS temperature_max, AVG(temperature) AS temperature_avg, "
            "AVG(humidity) AS humidity_avg, MAX(wind_speed) AS wind_max, SUM(rainfall) AS rainfall_total "
            f"FROM measurements WHERE {where}",
            values,
        )
        return cursor.fetchone()
