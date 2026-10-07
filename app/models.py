from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

StationId = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


class StationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: StationId
    name: str = Field(min_length=1, max_length=100)
    location: str = Field(default="", max_length=200)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El nombre no puede estar vacío")
        return value.strip()


class MeasurementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    station_id: StationId
    measured_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    temperature: float | None = Field(default=None, ge=-80, le=70, description="°C")
    humidity: float | None = Field(default=None, ge=0, le=100, description="%")
    pressure: float | None = Field(default=None, ge=300, le=1200, description="hPa")
    wind_speed: float | None = Field(default=None, ge=0, le=400, description="km/h")
    wind_direction: float | None = Field(default=None, ge=0, lt=360, description="Grados")
    rainfall: float | None = Field(default=None, ge=0, le=1000, description="mm por intervalo de muestreo")

    @field_validator("measured_at")
    @classmethod
    def utc_time(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Incluir zona horaria: Z o desplazamiento, por ejemplo -03:00")
        value = value.astimezone(timezone.utc)
        if value.year < 2000 or value.year > 2099:
            raise ValueError("La fecha debe estar entre 2000 y 2099")
        return value

    @model_validator(mode="after")
    def at_least_one_sensor(self):
        if all(getattr(self, field) is None for field in SENSOR_FIELDS):
            raise ValueError("Enviar al menos una lectura de sensor")
        return self


SENSOR_FIELDS = ("temperature", "humidity", "pressure", "wind_speed", "wind_direction", "rainfall")


class Measurement(MeasurementCreate):
    id: int
    received_at: datetime


class MeasurementPage(BaseModel):
    items: list[Measurement]
    total: int
    limit: int
    offset: int
