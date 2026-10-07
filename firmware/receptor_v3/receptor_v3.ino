#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <heltec_unofficial.h>
#include <esp_system.h>
#include <sys/time.h>
#include <math.h>

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif
#include "dashboard.h"

WebServer server(80);

float temperatura = 0, humedad = 0;
int mq2 = 0, mq135 = 0, mq9 = 0, uv = 0;
float ultimoRSSI = 0, ultimoSNR = 0;
unsigned long ultimoPaquete = 0, ultimoIntentoWifi = 0;
bool hayPaquete = false;
String ultimoPaqueteTexto = "Esperando datos...";
volatile bool paqueteDisponible = false;
volatile int ultimoHTTP = 0;
volatile uint32_t descartadosCola = 0, rechazadosAPI = 0;
uint32_t bootIdA, bootIdB, secuencia = 0;

struct PaquetePendiente {
  char texto[181];
  char sampleId[40];
  char fechaUTC[40];
  float rssi;
  float snr;
};
QueueHandle_t colaAPI;
constexpr uint8_t CAPACIDAD_COLA = 24;

void IRAM_ATTR alRecibirLoRa() { paqueteDisponible = true; }

bool procesarPaquete(const String& paquete) {
  if (paquete.length() > 180) return false;
  float t, h;
  int a, b, c, d, consumidos = 0;
  int campos = sscanf(paquete.c_str(), "T:%f,H:%f,MQ2:%d,MQ135:%d,MQ9:%d,UV:%d%n",
                       &t, &h, &a, &b, &c, &d, &consumidos);
  if (campos != 6 || consumidos != static_cast<int>(paquete.length())) return false;
  if (!isfinite(t) || !isfinite(h)) return false;
  if (t != -99 && (t < -80 || t > 70)) return false;
  if (h != -99 && (h < 0 || h > 100)) return false;
  if (a < 0 || a > 4095 || b < 0 || b > 4095 || c < 0 || c > 4095 || d < 0 || d > 4095) return false;
  temperatura = t;
  humedad = h;
  mq2 = a; mq135 = b; mq9 = c; uv = d;
  ultimoPaquete = millis();
  hayPaquete = true;
  ultimoPaqueteTexto = paquete;
  return true;
}

void encolarPaquete(const String& paquete) {
  PaquetePendiente p = {};
  paquete.toCharArray(p.texto, sizeof(p.texto));
  snprintf(p.sampleId, sizeof(p.sampleId), "%08lx%08lx-%08lx",
           static_cast<unsigned long>(bootIdA), static_cast<unsigned long>(bootIdB),
           static_cast<unsigned long>(++secuencia));
  p.rssi = ultimoRSSI;
  p.snr = ultimoSNR;
  timeval ahora;
  gettimeofday(&ahora, nullptr);
  // NTP se sincroniza en segundo plano. Sin reloj válido la API asigna su hora UTC.
  if (ahora.tv_sec >= 1577836800) {
    tm utc;
    gmtime_r(&ahora.tv_sec, &utc);
    char segundos[24];
    strftime(segundos, sizeof(segundos), "%Y-%m-%dT%H:%M:%S", &utc);
    snprintf(p.fechaUTC, sizeof(p.fechaUTC), "%s.%06ldZ", segundos, static_cast<long>(ahora.tv_usec));
  }
  if (xQueueSend(colaAPI, &p, 0) != pdTRUE) {
    ++descartadosCola;
    Serial.println("Cola API llena: lectura nueva descartada; el panel local sigue activo.");
  }
}

int publicar(const PaquetePendiente& p) {
  HTTPClient http;
  WiFiClient cliente;
  WiFiClientSecure clienteTLS;
  String url(ECORED_API_URL);
  bool iniciado = false;
  if (url.startsWith("https://")) {
    if (ECORED_ROOT_CA == nullptr || ECORED_ROOT_CA[0] == '\0') return -100;
    clienteTLS.setCACert(ECORED_ROOT_CA);
    iniciado = http.begin(clienteTLS, url);
  } else if (url.startsWith("http://")) {
    iniciado = http.begin(cliente, url);
  }
  if (!iniciado) return -101;
  http.setConnectTimeout(3000);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", ECORED_API_KEY);
  // El paquete validado contiene únicamente claves conocidas, números, comas y dos puntos.
  // station_id debe cumplir [A-Za-z0-9_-]+, igual que la API.
  String json;
  json.reserve(450);
  json = "{\"station_id\":\"" + String(ECORED_STATION_ID) + "\",\"sample_id\":\"" +
         String(p.sampleId) + "\",\"packet\":\"" + String(p.texto) + "\",\"rssi\":" +
         String(p.rssi, 1) + ",\"snr\":" + String(p.snr, 1);
  if (p.fechaUTC[0]) json += ",\"measured_at\":\"" + String(p.fechaUTC) + "\"";
  json += "}";
  int codigo = http.POST(json);
  http.end();
  return codigo;
}

void tareaPublicar(void*) {
  PaquetePendiente p;
  uint32_t espera = 2000;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
    if (xQueuePeek(colaAPI, &p, pdMS_TO_TICKS(1000)) != pdTRUE) continue;
    int codigo = publicar(p);
    ultimoHTTP = codigo;
    Serial.printf("FastAPI HTTP: %d\n", codigo);
    if (codigo == 201 || codigo == 409) {
      // 409: este sample_id ya se guardó. Nunca generar otro ID para un reintento.
      xQueueReceive(colaAPI, &p, 0);
      espera = 2000;
    } else if (codigo >= 400 && codigo < 500 && codigo != 408 && codigo != 429) {
      ++rechazadosAPI;
      xQueueReceive(colaAPI, &p, 0);
      Serial.println("Lectura rechazada: revisa station_id, clave API y formato.");
      vTaskDelay(pdMS_TO_TICKS(2000));
    } else {
      // Errores de red/servidor: conserva el paquete y reintenta con el mismo sample_id.
      vTaskDelay(pdMS_TO_TICKS(espera));
      espera = min(espera * 2, static_cast<uint32_t>(30000));
    }
  }
}

void enviarDatos() {
  unsigned long segundos = hayPaquete ? (millis() - ultimoPaquete) / 1000 : 9999;
  String json = "{\"temperatura\":";
  json += hayPaquete && temperatura != -99 ? String(temperatura, 1) : "null";
  json += ",\"humedad\":";
  json += hayPaquete && humedad != -99 ? String(humedad, 1) : "null";
  json += ",\"mq2\":" + (hayPaquete ? String(mq2) : String("null"));
  json += ",\"mq135\":" + (hayPaquete ? String(mq135) : String("null"));
  json += ",\"mq9\":" + (hayPaquete ? String(mq9) : String("null"));
  json += ",\"uv\":" + (hayPaquete ? String(uv) : String("null"));
  json += ",\"rssi\":" + (hayPaquete ? String(ultimoRSSI, 1) : String("null"));
  json += ",\"snr\":" + (hayPaquete ? String(ultimoSNR, 1) : String("null"));
  json += ",\"segundos\":" + String(segundos);
  json += ",\"online\":" + String(hayPaquete && segundos < 10 ? "true" : "false");
  json += ",\"api_http\":" + String(ultimoHTTP);
  json += ",\"pendientes\":" + String(uxQueueMessagesWaiting(colaAPI));
  json += ",\"descartados_cola\":" + String(descartadosCola);
  json += ",\"rechazados_api\":" + String(rechazadosAPI) + "}";
  server.send(200, "application/json", json);
}

void verificarRadio(int estado) {
  if (estado == RADIOLIB_ERR_NONE) return;
  Serial.printf("Error configurando LoRa: %d\n", estado);
  while (true) { heltec_loop(); delay(1000); }
}

void setup() {
  heltec_setup();
  Serial.println("ECORED V3: LoRa + panel local + FastAPI");
  verificarRadio(radio.begin());
  verificarRadio(radio.setFrequency(905.2));
  verificarRadio(radio.setBandwidth(250.0));
  verificarRadio(radio.setSpreadingFactor(12));
  verificarRadio(radio.setCodingRate(5));
  verificarRadio(radio.setPreambleLength(8));
  verificarRadio(radio.setCRC(true));

  colaAPI = xQueueCreate(CAPACIDAD_COLA, sizeof(PaquetePendiente));
  if (colaAPI == nullptr) { Serial.println("Sin memoria para cola API"); while (true) delay(1000); }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  bootIdA = esp_random(); bootIdB = esp_random();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  // WiFi y HTTP trabajan sin bloquear la recepción LoRa ni el servidor local.
  if (xTaskCreate(tareaPublicar, "ecored_http", 12288, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("No se pudo crear la tarea HTTP"); while (true) delay(1000);
  }
  server.on("/", []() { server.send_P(200, "text/html; charset=utf-8", PAGINA); });
  server.on("/datos", enviarDatos);
  server.begin();
  radio.setDio1Action(alRecibirLoRa);
  verificarRadio(radio.startReceive());
}

void loop() {
  heltec_loop();
  server.handleClient();
  if (WiFi.status() != WL_CONNECTED && millis() - ultimoIntentoWifi >= 15000) {
    ultimoIntentoWifi = millis();
    WiFi.reconnect();
  }
  if (paqueteDisponible) {
    paqueteDisponible = false;
    String paquete;
    int estado = radio.readData(paquete);
    if (estado == RADIOLIB_ERR_NONE) {
      ultimoRSSI = radio.getRSSI();
      ultimoSNR = radio.getSNR();
      if (procesarPaquete(paquete)) {
        encolarPaquete(paquete);
        Serial.println("LoRa RX: " + paquete);
      } else Serial.println("Paquete LoRa inválido ignorado");
    } else Serial.printf("Error leyendo LoRa: %d\n", estado);
    verificarRadio(radio.startReceive());
  }
  delay(2);
}
