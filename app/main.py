import csv
import io
import logging
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import pymysql
from fastapi import Depends, FastAPI, HTTPException, Query, Security
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles

from app import repository
from app.config import get_settings
from app.database import connection
from app.models import (
    SENSOR_FIELDS,
    Measurement,
    MeasurementCreate,
    MeasurementPage,
    StationCreate,
    StationId,
)

logger = logging.getLogger(__name__)
app = FastAPI(
    title="EcoRed · API meteorológica",
    version="1.0.0",
    description="Recepción de lecturas LoRa, consulta de datos actuales e historial. Fechas en UTC.",
)
STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")
api_key = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_key(value: Annotated[str | None, Security(api_key)]):
    expected = get_settings().ingest_api_key.get_secret_value()
    if len(expected) < 32 or expected.startswith("replace-with-"):
        raise HTTPException(503, "Configura INGEST_API_KEY con una clave aleatoria de al menos 32 caracteres")
    if not value or not secrets.compare_digest(value.encode(), expected.encode()):
        raise HTTPException(401, "Clave de estación inválida")


@app.exception_handler(pymysql.MySQLError)
async def database_error(request, exc):
    if isinstance(exc, pymysql.IntegrityError):
        if exc.args[0] == 1062:
            return JSONResponse(status_code=409, content={"detail": "La estación o medición ya existe"})
        if exc.args[0] == 1452:
            return JSONResponse(status_code=404, content={"detail": "Estación no registrada"})
    # No registrar mensajes del controlador: pueden contener datos de conexión.
    logger.error("Operación MySQL fallida (%s)", type(exc).__name__)
    return JSONResponse(
        status_code=503, content={"detail": "Base de datos no disponible. Revisa la conexión y el esquema."}
    )


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(STATIC / "index.html")


@app.get("/health", tags=["Estado"])
def health():
    return {"status": "ok"}


@app.get("/health/db", tags=["Estado"])
def database_health():
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute("SELECT 1 FROM stations LIMIT 1")
        cursor.execute("SELECT 1 FROM measurements LIMIT 1")
    return {"status": "ok", "database": "mysql"}


@app.get("/api/stations", tags=["Estaciones"], response_model=list[StationCreate])
def stations():
    return repository.list_stations()


@app.post(
    "/api/stations",
    tags=["Estaciones"],
    status_code=201,
    response_model=StationCreate,
    dependencies=[Depends(require_key)],
)
def register_station(station: StationCreate):
    return repository.create_station(station)


@app.post(
    "/api/measurements",
    tags=["Mediciones"],
    status_code=201,
    response_model=Measurement,
    dependencies=[Depends(require_key)],
)
def ingest(data: MeasurementCreate):
    return repository.create_measurement(data)


@app.get("/api/measurements/latest", tags=["Mediciones"], response_model=Measurement)
def latest(station_id: Annotated[StationId, Query()]):
    row = repository.latest(station_id)
    if row is None:
        raise HTTPException(404, "No hay mediciones para esta estación")
    return row


def date_range(start: datetime | None = None, end: datetime | None = None):
    for value in (start, end):
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise HTTPException(422, "Los filtros de fecha deben incluir zona horaria")
    if start and end and start > end:
        raise HTTPException(422, "La fecha inicial debe ser anterior a la final")
    return start, end


DateRange = Annotated[tuple[datetime | None, datetime | None], Depends(date_range)]


@app.get("/api/measurements", tags=["Mediciones"], response_model=MeasurementPage)
def measurements(
    station_id: Annotated[StationId, Query()],
    dates: DateRange,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return repository.history(station_id, *dates, limit, offset)


@app.get("/api/measurements/summary", tags=["Mediciones"])
def summary(station_id: Annotated[StationId, Query()], dates: DateRange):
    return repository.summary(station_id, *dates)


@app.get("/api/measurements/export", tags=["Mediciones"])
def export(station_id: Annotated[StationId, Query()], dates: DateRange):
    page = repository.history(station_id, *dates, 10000, 0)
    if page["total"] > 10000:
        raise HTTPException(422, "Exportación limitada a 10000 filas; reduce el rango de fechas")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    fields = ("id", "station_id", "measured_at", *SENSOR_FIELDS, "received_at")
    writer.writerow(fields)
    for row in page["items"]:
        writer.writerow(
            row[field].astimezone(timezone.utc).isoformat()
            if isinstance(row[field], datetime)
            else row[field]
            for field in fields
        )
    return Response(
        "\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="ecored-{station_id}.csv"'},
    )
