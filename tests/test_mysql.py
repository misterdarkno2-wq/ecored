"""Prueba real contra una base dedicada; elimina únicamente su estación temporal."""

import csv
import io
import os
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.database import connection
from app.main import app
from scripts.init_db import main as init_db

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_DB_TESTS") != "1", reason="RUN_DB_TESTS=1 requiere MySQL de pruebas"),
]


def test_real_mysql_roundtrip():
    init_db()
    init_db()  # Inicializar dos veces conserva el esquema y los datos.
    station = "TEST-" + uuid.uuid4().hex
    headers = {"X-API-Key": get_settings().ingest_api_key.get_secret_value()}
    with TestClient(app) as client:
        try:
            assert client.get("/health/db").status_code == 200
            assert (
                client.post(
                    "/api/stations",
                    json={"id": station, "name": "Prueba SQL", "location": "Laboratorio"},
                    headers=headers,
                ).status_code
                == 201
            )
            assert (
                client.post(
                    "/api/stations", json={"id": station, "name": "Duplicada"}, headers=headers
                ).status_code
                == 409
            )
            for hour, temperature in [(10, 20), (11, 22), (12, 24)]:
                payload = {
                    "station_id": station,
                    "measured_at": f"2026-10-07T{hour}:00:00-03:00",
                    "temperature": temperature,
                    "humidity": 50,
                    "pressure": 1012,
                    "rainfall": 1.5,
                }
                created = client.post("/api/measurements", json=payload, headers=headers)
                assert created.status_code == 201, created.text
                assert created.json()["measured_at"] == f"2026-10-07T{hour + 3}:00:00Z"
            assert client.post("/api/measurements", json=payload, headers=headers).status_code == 409
            latest = client.get("/api/measurements/latest", params={"station_id": station}).json()
            assert latest["temperature"] == 24
            assert latest["wind_speed"] is None
            assert latest["received_at"].endswith("Z")
            params = {"station_id": station, "start": "2026-10-07T13:00:00Z", "end": "2026-10-07T15:00:00Z"}
            page = client.get("/api/measurements", params={**params, "limit": 1, "offset": 1}).json()
            assert page["total"] == 3 and page["items"][0]["temperature"] == 22
            summary = client.get("/api/measurements/summary", params=params).json()
            assert summary["count"] == 3 and summary["temperature_avg"] == 22
            assert summary["rainfall_total"] == 4.5
            csv_response = client.get("/api/measurements/export", params=params)
            assert csv_response.status_code == 200
            rows = list(csv.DictReader(io.StringIO(csv_response.text.lstrip("\ufeff"))))
            assert len(rows) == 3 and rows[0]["temperature"] == "24.0"
            lora_payload = {
                "station_id": station,
                "sample_id": "boot-00001",
                "packet": "T:-99.0,H:60.2,MQ2:1200,MQ135:850,MQ9:430,UV:210",
                "rssi": -95.5,
                "snr": 7.2,
            }
            receiver = client.post("/api/measurements/lora", json=lora_payload, headers=headers)
            assert receiver.status_code == 201, receiver.text
            assert receiver.json()["temperature"] is None and receiver.json()["mq2"] == 1200
            # Sin timestamp del receptor, sample_id evita duplicar en un reintento.
            assert (
                client.post("/api/measurements/lora", json=lora_payload, headers=headers).status_code == 409
            )
            current = client.get("/api/measurements/latest", params={"station_id": station}).json()
            assert current["sample_id"] == "boot-00001" and current["rssi"] == -95.5
            all_rows = client.get("/api/measurements/export", params={"station_id": station})
            exported = list(csv.DictReader(io.StringIO(all_rows.text.lstrip("\ufeff"))))
            assert any(row["mq2"] == "1200" and row["sample_id"] == "boot-00001" for row in exported)
            aggregates = client.get("/api/measurements/summary", params={"station_id": station}).json()
            assert aggregates["mq135_avg"] == 850 and aggregates["uv_max"] == 210
            assert (
                client.post(
                    "/api/measurements",
                    json={"station_id": "UNKNOWN-" + station, "temperature": 20},
                    headers=headers,
                ).status_code
                == 404
            )
        finally:
            with connection() as conn, conn.cursor() as cursor:
                cursor.execute("DELETE FROM measurements WHERE station_id = %s", (station,))
                cursor.execute("DELETE FROM stations WHERE id = %s", (station,))
