"""Generar config.h local usando la clave de .env sin imprimirla."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from app.config import get_settings
from app.models import StationCreate


def main():
    parser = argparse.ArgumentParser(description="Configurar receptor Heltec V3 para EcoRed")
    parser.add_argument(
        "--api-url", required=True, help="URL base de Uvicorn, ejemplo http://192.168.1.240:8000"
    )
    parser.add_argument("--station", default="EST-001")
    args = parser.parse_args()
    StationCreate(id=args.station, name="Validación")
    url = urlparse(args.api_url)
    if (
        url.scheme not in ("http", "https")
        or not url.hostname
        or url.username
        or url.password
        or url.query
        or url.fragment
    ):
        parser.error("Indica una URL HTTP/HTTPS sin credenciales, consulta ni fragmento")
    key = get_settings().ingest_api_key.get_secret_value()
    if len(key) < 32 or key.startswith("replace-with-"):
        parser.error("Configura primero INGEST_API_KEY en .env")
    endpoint = args.api_url.rstrip("/") + "/api/measurements/lora"
    template = Path("firmware/receptor_v3/config.example.h").read_text(encoding="utf-8")
    template = template.replace('"http://IP_DEL_SERVIDOR:8000/api/measurements/lora"', json.dumps(endpoint))
    template = template.replace('"replace-with-the-key-from-your-local-env-file"', json.dumps(key))
    template = template.replace('"EST-001"', json.dumps(args.station))
    target = Path("firmware/receptor_v3/config.h")
    if target.exists():
        parser.error("config.h ya existe; edítalo directamente para conservar tu Wi-Fi y certificado")
    target.write_text(template, encoding="utf-8")
    print("config.h creado. Completa WIFI_SSID y WIFI_PASSWORD; la clave API ya está configurada.")


if __name__ == "__main__":
    main()
