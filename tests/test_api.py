from datetime import datetime, timezone
from unittest.mock import MagicMock

import pymysql
import pytest
from fastapi.testclient import TestClient

from app import database, repository
from app.config import Settings, get_settings
from app.main import app

KEY = "test-key-" + "a" * 32
HEADERS = {"X-API-Key": KEY}
client = TestClient(app)


@pytest.fixture(autouse=True)
def settings_override():
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, ingest_api_key=KEY)
    # require_key usa get_settings directamente.
    original = get_settings()
    old_key = original.ingest_api_key
    original.ingest_api_key = Settings(_env_file=None, ingest_api_key=KEY).ingest_api_key
    yield
    original.ingest_api_key = old_key
    app.dependency_overrides.clear()


def test_dashboard_and_health():
    assert client.get("/").status_code == 200
    assert "El clima, más cerca." in client.get("/").text
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/health").json() == {"status": "ok"}
    assert (
        client.get("/openapi.json").json()["components"]["securitySchemes"]["APIKeyHeader"]["name"]
        == "X-API-Key"
    )


@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}])
def test_ingestion_requires_key(headers):
    assert (
        client.post(
            "/api/measurements", json={"station_id": "EST-001", "temperature": 23}, headers=headers
        ).status_code
        == 401
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"humidity": 101},
        {"wind_speed": -1},
        {"wind_direction": 360},
        {"measured_at": "2026-10-07T12:00:00"},
        {"temperature": None},
        {"station_id": "x'; DROP TABLE stations; --"},
        {"unexpected": 1},
    ],
)
def test_sensor_validation(changes):
    payload = {"station_id": "EST-001", "temperature": 23, **changes}
    assert client.post("/api/measurements", json=payload, headers=HEADERS).status_code == 422


def test_ingest_normalizes_offset_to_utc(monkeypatch):
    def insert(data):
        assert data.measured_at == datetime(2026, 10, 7, 15, tzinfo=timezone.utc)
        return {**data.model_dump(), "id": 1, "received_at": data.measured_at}

    monkeypatch.setattr(repository, "create_measurement", insert)
    response = client.post(
        "/api/measurements",
        json={"station_id": "EST-001", "temperature": 23, "measured_at": "2026-10-07T12:00:00-03:00"},
        headers=HEADERS,
    )
    assert response.status_code == 201
    assert response.json()["measured_at"] == "2026-10-07T15:00:00Z"


def test_missing_latest(monkeypatch):
    monkeypatch.setattr(repository, "latest", lambda _: None)
    assert client.get("/api/measurements/latest", params={"station_id": "EST-001"}).status_code == 404


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-10-07T12:00:00"},
        {"start": "2026-10-08T00:00:00Z", "end": "2026-10-07T00:00:00Z"},
        {"limit": 1001},
        {"offset": -1},
    ],
)
def test_invalid_history_filters(params):
    assert client.get("/api/measurements", params={"station_id": "EST-001", **params}).status_code == 422


@pytest.mark.parametrize("code,expected", [(1062, 409), (1452, 404), (2003, 503)])
def test_database_errors_do_not_expose_credentials(monkeypatch, code, expected):
    def fail(_):
        raise pymysql.IntegrityError(code, "secret-password host=private-host")

    monkeypatch.setattr(repository, "create_station", fail)
    response = client.post("/api/stations", json={"id": "EST-001", "name": "Estación"}, headers=HEADERS)
    assert response.status_code == expected
    assert "secret-password" not in response.text
    assert "private-host" not in response.text


def test_export_refuses_silent_truncation(monkeypatch):
    monkeypatch.setattr(repository, "history", lambda *args: {"items": [], "total": 10001})
    assert client.get("/api/measurements/export", params={"station_id": "EST-001"}).status_code == 422


def test_connection_commits_rolls_back_and_closes(monkeypatch):
    conn = MagicMock()
    monkeypatch.setattr(database.pymysql, "connect", lambda **kwargs: conn)
    with database.connection():
        pass
    conn.commit.assert_called_once()
    conn.close.assert_called_once()
    conn.reset_mock()
    with pytest.raises(ValueError), database.connection():
        raise ValueError("failed insert")
    conn.rollback.assert_called_once()
    conn.commit.assert_not_called()
    conn.close.assert_called_once()
