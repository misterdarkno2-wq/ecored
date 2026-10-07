# Receptor Heltec V3 → FastAPI

Abre `receptor_v3/receptor_v3.ino` en Arduino IDE. Usa la placa **Heltec WiFi LoRa 32(V3)**, el núcleo ESP32 de Espressif y la biblioteca **Heltec_ESP32_LoRa_v3** (`heltec_unofficial.h`, con RadioLib). El receptor conserva el panel local en `http://IP_DEL_V3/` y `/datos`.

## Configuración

Desde la raíz del proyecto, prepara `.env` con la conexión MySQL y una `INGEST_API_KEY` aleatoria de al menos 32 caracteres. Ejecuta:

```console
python -m scripts.configure_receiver --api-url http://IP_DEL_COMPUTADOR:8000
```

Se crea `receptor_v3/config.h` con la misma clave que usa FastAPI. Completa allí `WIFI_SSID` y `WIFI_PASSWORD`. También puedes copiar `config.example.h` manualmente y completar todos los campos. `config.h` queda excluido de Git. `ECORED_STATION_ID` debe ser el identificador registrado en la API (`EST-001` se crea al inicializar la base).

La URL apunta al equipo donde ejecutas **Uvicorn**, no al host de MySQL ni al repositorio GitHub. El V3 y ese equipo deben poder comunicarse por el puerto 8000. Si cambias la IP del equipo, actualiza `ECORED_API_URL`.

```console
python -m scripts.init_db
python -m scripts.check_db
python -m scripts.run_server
```

El lanzador usa Uvicorn en `0.0.0.0:8000`; admite `--host`, `--port` y `--reload`. Abre `/docs` para probar la API y `/health/db` para comprobar conexión y tablas.

Para HTTPS, configura el certificado PEM de la CA en `ECORED_ROOT_CA`. El receptor verifica el certificado; no usa `setInsecure()`. Para HTTP en la red local no hace falta certificado.

## Compatibilidad con los códigos enviados

El emisor WROOM32 y el puente V4 pueden conservar el código proporcionado: sus UUID BLE y su paquete textual no cambian. El receptor mantiene **905.2 MHz, BW 250 kHz, SF12, CR 4/5, preámbulo 8 y CRC activado**, igual que el puente.

El paquete esperado es:

```text
T:23.4,H:65.2,MQ2:1200,MQ135:850,MQ9:430,UV:210
```

`ECORED_READY` y paquetes incompletos o mal formados se ignoran. `T:-99` o `H:-99` son fallos del DHT y se guardan como `null`, conservando las otras lecturas. MQ2, MQ135, MQ9 y UV son lecturas ADC crudas de 12 bits (0–4095); el panel no las convierte a ppm ni a índice UV. Esas conversiones necesitan calibración y el modelo específico del sensor.

El envío HTTP usa el nuevo endpoint `POST /api/measurements/lora`:

```json
{
  "station_id": "EST-001",
  "sample_id": "b001-00000001",
  "packet": "T:23.4,H:65.2,MQ2:1200,MQ135:850,MQ9:430,UV:210",
  "rssi": -97.5,
  "snr": 7.2,
  "measured_at": "2026-10-07T16:00:00.123456Z"
}
```

La cabecera `X-API-Key` lleva la clave del servidor. El receptor crea un ID por recepción y lo conserva en cada reintento. La base impide repetir la pareja estación/ID, incluso si el reloj NTP aún no está sincronizado. `measured_at` es opcional: sin NTP, la API utiliza su hora de recepción. La hora del V3 indica cuándo recibió el paquete, pues el emisor original no incluye una fecha de muestreo.

## Envío y estado

- La recepción LoRa usa interrupciones y el envío HTTP una tarea independiente; el panel local sigue atendiendo peticiones.
- La cola guarda hasta 24 paquetes en RAM. Con paquetes cada 2 segundos equivale aproximadamente a 48 segundos de lecturas; no es almacenamiento permanente.
- Si la cola se llena, se descartan las nuevas lecturas y aumenta `descartados_cola`. Al reiniciar el V3 se pierde la cola pendiente.
- Errores de red, `408`, `429` o `5xx` conservan el paquete y reintentan con esperas de 2 a 30 segundos. `201` o `409` completan el envío.
- Otros `4xx` descartan el paquete rechazado y aumentan `rechazados_api`; revisa la clave, la estación y el JSON.
- El panel del V3 muestra el último HTTP, la cola y los contadores. `/datos` expone `api_http`, `pendientes`, `descartados_cola` y `rechazados_api`, además de las lecturas locales.

No se necesita ninguna contraseña MySQL en el ESP32; esa conexión pertenece a FastAPI.

Referencias: [biblioteca Heltec utilizada](https://github.com/ropg/heltec_esp32_lora_v3), [ADC de Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).

## Compilación verificada

Receptor compilado para `esp32:esp32:heltec_wifi_lora_32_V3` con Arduino-ESP32 3.3.12, Heltec_ESP32_LoRa_v3 0.9.2 y RadioLib 7.8.1. La verificación de compilación no sustituye la prueba física de recepción y envío con tus placas.
