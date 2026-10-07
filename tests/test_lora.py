from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app import repository
from app.lora import parse_packet
from app.models import LoRaPacket, MeasurementCreate
from tests.test_api import HEADERS, client, settings_override  # noqa: F401

PACKET = "T:23.4,H:65.2,MQ2:1200,MQ135:850,MQ9:430,UV:210"


def test_receiver_packet_saves_all_fields(monkeypatch):
    def insert(data):
        assert (data.mq2, data.mq135, data.mq9, data.uv) == (1200, 850, 430, 210)
        assert data.rssi == -97.5 and data.snr == 7.2
        assert data.sample_id == "boot-001"
        return {**data.model_dump(), "id": 1, "received_at": datetime.now(timezone.utc)}

    monkeypatch.setattr(repository, "create_measurement", insert)
    response = client.post(
        "/api/measurements/lora",
        json={"station_id": "EST-001", "sample_id": "boot-001", "packet": PACKET, "rssi": -97.5, "snr": 7.2},
        headers=HEADERS,
    )
    assert response.status_code == 201, response.text
    assert response.json()["mq2"] == 1200


def test_failed_dht_is_null_and_adc_zero_is_valid():
    reading = parse_packet(
        LoRaPacket(
            station_id="EST-001", sample_id="boot-002", packet="T:-99.0,H:-99.0,MQ2:0,MQ135:0,MQ9:0,UV:0"
        )
    )
    assert reading.temperature is None and reading.humidity is None
    assert reading.mq2 == 0 and reading.uv == 0


@pytest.mark.parametrize(
    "packet",
    [
        "ECORED_READY",
        PACKET + ",MQ2:10",
        PACKET.replace("MQ2:1200", "MQ2:4096"),
        PACKET.replace("MQ2:1200", "MQ2:1.5"),
        PACKET.replace("MQ2:1200", "MQ2:-1"),
        PACKET.replace("T:23.4", "T:nan"),
        PACKET.replace("T:23.4", "T:99"),
        PACKET.replace("H:65.2", "H:abc"),
        PACKET.replace(",UV:210", ""),
        PACKET.replace("UV:210", "SQL:210"),
    ],
)
def test_bad_packets_are_rejected_before_database(packet):
    response = client.post(
        "/api/measurements/lora",
        json={"station_id": "EST-001", "sample_id": "boot-001", "packet": packet},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_packet_ingestion_requires_key():
    assert (
        client.post(
            "/api/measurements/lora",
            json={"station_id": "EST-001", "sample_id": "boot-001", "packet": PACKET},
        ).status_code
        == 401
    )


def test_spanish_sensor_names_are_accepted():
    reading = MeasurementCreate.model_validate(
        {
            "station_id": "EST-001",
            "temperatura": 24,
            "humedad": 50,
            "mq2": 42,
            "ultimoRSSI": -90,
            "ultimoSNR": 5,
        }
    )
    assert reading.temperature == 24 and reading.humidity == 50 and reading.rssi == -90


@pytest.mark.parametrize("value", [True, "100", 10.5, -1, 4096])
def test_adc_requires_real_12_bit_integer(value):
    with pytest.raises(ValidationError):
        MeasurementCreate(station_id="EST-001", mq2=value)


def test_radio_metadata_alone_is_not_a_sensor_measurement():
    with pytest.raises(ValidationError):
        MeasurementCreate(station_id="EST-001", rssi=-100, snr=5)
