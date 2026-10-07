# EcoRed · Monitoreo ambiental

Servidor **FastAPI**, conexión directa a **MySQL con PyMySQL** y panel web en español. Implementa la parte servidor/base de datos/página del flujo:

```text
Sensores → ESP32 → Heltec LoRa → Estación base → HTTP/JSON → FastAPI → MySQL
                                                               ↕
                                                        Panel ambiental
```

Incluye el [receptor Heltec V3 adaptado](firmware/README.md) para el paquete del WROOM32 y puente V4 proporcionados: `T:…,H:…,MQ2:…,MQ135:…,MQ9:…,UV:…`. La conexión MySQL está en FastAPI; el V3 envía por HTTP.

## Qué incluye

- Recepción de mediciones con `X-API-Key`, validación de sensores y fechas UTC.
- Estaciones, última lectura, historial paginado, resumen y exportación CSV.
- Panel adaptable a móvil: temperatura, humedad, MQ2, MQ135, MQ9, UV, RSSI y SNR, gráficos y actualización cada 30 segundos.
- Receptor V3 con panel local, cola de envío, reintentos y prevención de duplicados por `sample_id`.
- Estados explícitos para ausencia de lecturas, datos antiguos y fallos de conexión. No se generan datos ficticios automáticamente.
- SQL parametrizado, transacciones, cierre de conexiones y respuestas sin credenciales.
- Esquema SQL, Docker Compose y pruebas de API y de integración con MySQL 8.4 en GitHub Actions.

## Inicio con Docker

1. Instala Docker con Compose.
2. Copia `.env.example` a `.env` y sustituye **todas** las contraseñas y `INGEST_API_KEY`. Genera la clave con `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
3. Ejecuta:

```console
docker compose up --build -d
```

Abre [el panel](http://localhost:8000), [la documentación interactiva](http://localhost:8000/docs) o [el estado de la base](http://localhost:8000/health/db).

Compose crea la base y las tablas, registra `EST-001` y conserva los datos en un volumen. MySQL no publica su puerto hacia el exterior. El archivo `.env` queda excluido de Git. Al cambiar contraseñas de una base ya inicializada, actualiza también los usuarios de MySQL: cambiar `.env` no modifica sus contraseñas existentes.

## Inicio sin Docker (Python 3.11 o superior)

Necesitas MySQL 8.0/8.4 en ejecución. En Windows PowerShell, desde la carpeta del proyecto:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Configura `.env` con el host, puerto, nombre de base, usuario, contraseña y clave de envío. Con un administrador de MySQL, crea una base y usuario (sustituye la contraseña):

```sql
CREATE DATABASE ecored CHARACTER SET utf8mb4;
CREATE USER 'ecored'@'localhost' IDENTIFIED BY 'tu-contraseña-de-base';
GRANT SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES ON ecored.* TO 'ecored'@'localhost';
```

El usuario anterior sirve para inicializar y ejecutar la aplicación local. En otro host, ajusta el origen permitido del usuario MySQL. Después:

```console
python -m scripts.init_db
python -m scripts.run_server
```

`scripts.init_db` requiere que la base ya exista. Se puede ejecutar repetidamente; crea tablas que falten y migra las versiones anteriores añadiendo los campos MQ/UV/RSSI/SNR y `sample_id`, sin borrar mediciones. `sql/schema.sql` sirve para instalaciones nuevas; para actualizar una base anterior utiliza el script. Uvicorn también puede iniciarse directamente con `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`. `--reload` habilita recarga en desarrollo.

## Enviar lecturas desde la estación base

URL: `POST http://IP_DEL_SERVIDOR:8000/api/measurements`

Cabeceras:

```text
Content-Type: application/json
X-API-Key: la-clave-configurada-en-INGEST_API_KEY
```

JSON de ejemplo, con las unidades requeridas:

```json
{
  "station_id": "EST-001",
  "measured_at": "2026-10-07T12:00:00-03:00",
  "temperature": 23.4,
  "humidity": 65.2,
  "mq2": 1200,
  "mq135": 850,
  "mq9": 430,
  "uv": 210,
  "rssi": -97.5,
  "snr": 7.2
}
```

`temperature`: °C, `humidity`: %. Se admiten también `temperatura` y `humedad` como nombres de entrada. `mq2`, `mq135`, `mq9` y `uv` son enteros ADC de 12 bits (0–4095), sin conversión a ppm o índice UV. `rssi`: dBm; `snr`: dB. El receptor también puede enviar el paquete original a `/api/measurements/lora`, como explica la [guía del V3](firmware/README.md).

La API conserva los campos opcionales de la primera versión: `pressure` (hPa), `wind_speed` (km/h), `wind_direction` (grados) y `rainfall` (mm por intervalo). Se siguen exportando en CSV; el panel muestra los sensores del hardware proporcionado.

Puedes omitir sensores no disponibles o enviarlos como `null`; debe existir al menos una lectura. `measured_at` acepta `Z` o un desplazamiento de zona horaria; al omitirlo se usa la hora UTC del servidor. Las fechas se guardan y devuelven en UTC; el panel las muestra en la zona horaria del dispositivo.

La respuesta correcta es `201`. Los errores posibles incluyen `401` (clave), `404` (estación sin registrar), `409` (misma estación/fecha o estación/`sample_id` ya registrada), `422` (datos inválidos) y `503` (configuración o base no disponible). Para reintentos usa el mismo `sample_id` y conserva la fecha si la tienes. `/api/measurements/lora` exige `sample_id`; en el endpoint JSON general es opcional. Un `409` indica que ya existe. Cada lectura nueva necesita un ID nuevo.

Ejemplo PowerShell para enviar una lectura con la fecha actual:

```powershell
$headers = @{ "X-API-Key" = "TU_CLAVE_CONFIGURADA" }
$body = @{
  station_id = "EST-001"
  measured_at = [DateTime]::UtcNow.ToString("o")
  temperature = 23.4
  humidity = 65.2
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/measurements" `
  -Headers $headers -ContentType "application/json" -Body $body
```

Para registrar otra estación, envía `POST /api/stations` con la misma cabecera y `{"id":"EST-002","name":"Estación norte","location":"Sector norte"}`. Aparecerá en el selector al recargar la página.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/` | Panel web |
| GET | `/health` | Servidor activo |
| GET | `/health/db` | Conexión y tablas disponibles |
| GET | `/api/stations` | Estaciones registradas |
| POST | `/api/stations` | Registrar estación (clave requerida) |
| POST | `/api/measurements` | Guardar lectura (clave requerida) |
| POST | `/api/measurements/lora` | Guardar paquete del V3 (clave requerida) |
| GET | `/api/measurements/latest?station_id=EST-001` | Última lectura por fecha de medición |
| GET | `/api/measurements?station_id=EST-001` | Historial descendente |
| GET | `/api/measurements/summary?station_id=EST-001` | Resumen del período |
| GET | `/api/measurements/export?station_id=EST-001` | CSV del período |
| GET | `/docs` | Swagger, ejemplos y pruebas |

Historial, resumen y CSV admiten `start` y `end` con zona horaria, ambos inclusivos. Historial admite `limit` (1–1000) y `offset`. Ejemplo: `/api/measurements?station_id=EST-001&start=2026-10-07T00:00:00Z&limit=50&offset=0`. Codifica `+` como `%2B` si usas desplazamientos positivos en la URL.

El gráfico muestra hasta las **1000 lecturas más recientes** del período; el historial permite recorrer todas y el resumen se calcula sobre todas. El CSV admite hasta **10000 filas**; si se excede ese límite, pide un período más pequeño, sin truncar silenciosamente. La condición «sin lecturas recientes» aparece después de 10 minutos sin mediciones nuevas; ajusta ese umbral en `app/static/app.js` si tu estación mide con menos frecuencia.

## Pruebas

```console
python -m pip install -r requirements-dev.txt
python -m pytest -q
ruff check app scripts tests
ruff format --check app scripts tests
```

Para la prueba real, apunta `.env` a una **base de pruebas separada**, con permisos de creación, lectura, escritura y borrado. En PowerShell:

```powershell
$env:RUN_DB_TESTS = "1"
python -m pytest -q
```

La prueba de integración crea una estación temporal y elimina únicamente sus filas al terminar. Sin esa variable se omite. GitHub Actions ejecuta ambas clases de pruebas contra MySQL 8.4.

## Publicación del servicio

Subir este repositorio a GitHub conserva el código; no pone en marcha un servidor o base de datos. Para uso remoto ejecuta el servicio en un equipo accesible a la estación base y usa HTTPS mediante un proxy. Las consultas del panel son públicas; la clave protege las escrituras y permanece en la estación base. No la añadas al JavaScript del panel. `--reload` es para desarrollo; omítelo al publicar el servicio.

Documentación de referencia: [FastAPI](https://fastapi.tiangolo.com/) y [conexiones, SQL parametrizado y commits de PyMySQL](https://pymysql.readthedocs.io/en/latest/user/examples.html).
