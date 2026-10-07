import re

from app.models import LoRaPacket, MeasurementCreate

FIELD_MAP = {"T": "temperature", "H": "humidity", "MQ2": "mq2", "MQ135": "mq135", "MQ9": "mq9", "UV": "uv"}
DECIMAL = re.compile(r"^-?\d+(?:\.\d+)?$")
INTEGER = re.compile(r"^\d+$")


def parse_packet(data: LoRaPacket) -> MeasurementCreate:
    """Contrato exacto del WROOM32; nunca convertir texto inválido en cero."""
    values = {}
    for token in data.packet.split(","):
        parts = token.strip().split(":")
        if len(parts) != 2:
            raise ValueError("Cada lectura LoRa debe tener formato CLAVE:valor")
        key, raw = parts[0].strip(), parts[1].strip()
        if key not in FIELD_MAP or key in values:
            raise ValueError("Clave LoRa desconocida o repetida")
        if key in ("T", "H"):
            if not DECIMAL.fullmatch(raw):
                raise ValueError("Temperatura o humedad LoRa inválida")
            value = float(raw)
            values[key] = None if value == -99 else value
        else:
            if not INTEGER.fullmatch(raw):
                raise ValueError("Las lecturas ADC deben ser enteros positivos o cero")
            values[key] = int(raw)
    if values.keys() != FIELD_MAP.keys():
        raise ValueError("El paquete debe incluir T, H, MQ2, MQ135, MQ9 y UV")
    payload = {FIELD_MAP[key]: value for key, value in values.items()}
    payload.update(station_id=data.station_id, sample_id=data.sample_id, rssi=data.rssi, snr=data.snr)
    if data.measured_at is not None:
        payload["measured_at"] = data.measured_at
    return MeasurementCreate.model_validate(payload)
