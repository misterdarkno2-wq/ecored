"use strict";
/*
 * Eco-Red · Modo de demostración.
 *
 * Se activa solo cuando index.html se abre directamente desde el disco
 * (doble clic, file://), cuando se publica en GitHub Pages (github.io)
 * o cuando la dirección termina en ?demo.
 * Reemplaza las consultas a /api/... por datos de ejemplo generados aquí,
 * para poder ver el panel sin el servidor. Con el servidor real no hace nada.
 *
 * Para usar el panel con datos reales, sírvalo desde el servidor FastAPI
 * de Eco-Red (vea el README). Este archivo se puede borrar sin problemas.
 */
(() => {
  const demo =
    location.protocol === "file:" ||
    location.hostname.endsWith(".github.io") ||
    new URLSearchParams(location.search).has("demo");
  if (!demo) return;

  const STEP_MINUTES = 30;
  const DAYS = 30;
  const now = Date.now();
  const wave = (hour, peak) => Math.sin(((hour - peak + 6) / 24) * 2 * Math.PI);

  // Mediciones de ejemplo de los últimos 30 días, de la más reciente a la más antigua.
  const rows = [];
  for (let i = 0; i < (DAYS * 24 * 60) / STEP_MINUTES; i++) {
    const time = new Date(now - i * STEP_MINUTES * 60000);
    const hour = time.getHours() + time.getMinutes() / 60;
    const day = wave(hour, 15);
    const sun = Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI));
    rows.push({
      id: 100000 - i,
      station_id: "DEMO-001",
      sample_id: null,
      measured_at: time.toISOString(),
      received_at: time.toISOString(),
      temperature: Math.round((18 + 6 * day + Math.sin(i / 3) * 0.5) * 10) / 10,
      humidity: Math.round((60 - 14 * day + Math.cos(i / 5) * 2) * 10) / 10,
      mq2: Math.round(320 + 45 * Math.sin(i / 7)),
      mq135: Math.round(460 + 70 * Math.cos(i / 9)),
      mq9: Math.round(280 + 30 * Math.sin(i / 4)),
      uv: Math.round(560 * sun),
      rssi: Math.round((-99 - 6 * Math.sin(i / 6)) * 10) / 10,
      snr: Math.round((7.5 + 2 * Math.cos(i / 8)) * 10) / 10,
      pressure: null,
      wind_speed: null,
      wind_direction: null,
      rainfall: null,
    });
  }

  const inPeriod = (params) => {
    const start = params.get("start") ? Date.parse(params.get("start")) : -Infinity;
    const end = params.get("end") ? Date.parse(params.get("end")) : Infinity;
    return rows.filter((r) => {
      const t = Date.parse(r.measured_at);
      return t >= start && t <= end;
    });
  };
  const average = (list, field) =>
    list.length ? list.reduce((sum, r) => sum + r[field], 0) / list.length : null;
  const extreme = (list, field, pick) =>
    list.length ? pick(...list.map((r) => r[field])) : null;

  const routes = {
    "/api/stations": () => [
      { id: "DEMO-001", name: "Estación de demostración", location: "Datos de ejemplo" },
    ],
    "/api/measurements/latest": () => rows[0],
    "/api/measurements/summary": (params) => {
      const list = inPeriod(params);
      return {
        count: list.length,
        temperature_min: extreme(list, "temperature", Math.min),
        temperature_max: extreme(list, "temperature", Math.max),
        temperature_avg: average(list, "temperature"),
        humidity_avg: average(list, "humidity"),
        mq2_avg: average(list, "mq2"),
        mq135_avg: average(list, "mq135"),
        mq9_avg: average(list, "mq9"),
        uv_max: extreme(list, "uv", Math.max),
      };
    },
    "/api/measurements": (params) => {
      const list = inPeriod(params);
      const limit = Number(params.get("limit") || 100);
      const offset = Number(params.get("offset") || 0);
      return { items: list.slice(offset, offset + limit), total: list.length, limit, offset };
    },
    "/api/measurements/export": (params) => {
      const fields = ["measured_at", "temperature", "humidity", "mq2", "mq135", "mq9", "uv", "rssi", "snr"];
      const lines = [fields.join(",")].concat(
        inPeriod(params).map((r) => fields.map((f) => r[f] ?? "").join(",")),
      );
      return new Blob([lines.join("\n")], { type: "text/csv" });
    },
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = new URL(String(input), "http://demo.local");
    const route = routes[url.pathname];
    if (!route) return realFetch(input, options);
    const body = route(url.searchParams);
    return body instanceof Blob
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
  };

  // Aviso visible: que nadie confunda los datos de ejemplo con datos reales.
  document.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("p");
    banner.className = "demo-banner";
    banner.setAttribute("role", "note");
    banner.textContent =
      "Modo de demostración: estos son datos de ejemplo, no mediciones reales.";
    document.body.prepend(banner);
  });
})();
