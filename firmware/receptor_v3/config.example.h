#pragma once

// Copia este archivo a config.h. config.h no se sube a GitHub.
constexpr const char* WIFI_SSID = "TU_WIFI";
constexpr const char* WIFI_PASSWORD = "TU_CLAVE";
// Dirección del computador/servidor que ejecuta Uvicorn. No es el host de MySQL.
constexpr const char* ECORED_API_URL = "http://IP_DEL_SERVIDOR:8000/api/measurements/lora";
constexpr const char* ECORED_API_KEY = "replace-with-the-key-from-your-local-env-file";
constexpr const char* ECORED_STATION_ID = "EST-001";
// Si usas HTTPS, pega aquí el certificado PEM de la CA del servidor.
// Nunca se desactiva la verificación de certificados.
constexpr const char* ECORED_ROOT_CA = nullptr;
