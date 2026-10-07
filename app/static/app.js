"use strict";
const $ = (id) => document.getElementById(id);
const units = {
  temperature: "°C",
  humidity: "%",
  mq2: "ADC",
  mq135: "ADC",
  mq9: "ADC",
  uv: "ADC",
  rssi: "dBm",
  snr: "dB",
};
const number = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "short",
});
const state = {
  station: "",
  offset: 0,
  limit: 10,
  total: 0,
  chart: [],
  dates: null,
  busy: false,
  stationsLoaded: false,
};
const fmt = (value, unit = "") =>
  value == null ? "—" : `${number.format(value)}${unit ? " " + unit : ""}`;

async function api(path, params) {
  const response = await fetch(path + (params ? "?" + params.toString() : ""), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(
      typeof data.detail === "string"
        ? data.detail
        : "No se pudo consultar el servidor.",
    );
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function period() {
  const end = new Date();
  return {
    start: new Date(
      end.getTime() - Number($("range").value) * 3600000,
    ).toISOString(),
    end: end.toISOString(),
  };
}
function params(extra = {}) {
  return new URLSearchParams({
    station_id: state.station,
    ...state.dates,
    ...extra,
  });
}
function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = !message;
}
function status(text, kind) {
  $("connection-status").textContent = text;
  $("status-dot").className = "dot " + kind;
}
function controls(disabled) {
  for (const id of ["station", "range", "refresh", "export"])
    $(id).disabled = disabled || (id === "export" && !state.station);
  $("previous").disabled = disabled || state.offset === 0;
  $("next").disabled = disabled || state.offset + state.limit >= state.total;
}

function renderLatest(row) {
  for (const field of Object.keys(units))
    if ($(field))
      $(field).textContent = fmt(
        row?.[field],
        ["rssi", "snr"].includes(field) ? units[field] : "",
      );
  $("updated").textContent = row
    ? "Última lectura: " + date.format(new Date(row.measured_at))
    : "Esperando la primera medición";
}
function renderSummary(summary) {
  for (const [id, field, unit] of [
    ["temp-min", "temperature_min", "°C"],
    ["temp-max", "temperature_max", "°C"],
    ["temp-avg", "temperature_avg", "°C"],
    ["humidity-avg", "humidity_avg", "%"],
    ["mq2-avg", "mq2_avg", "ADC"],
    ["mq135-avg", "mq135_avg", "ADC"],
    ["mq9-avg", "mq9_avg", "ADC"],
    ["uv-max", "uv_max", "ADC"],
  ])
    $(id).textContent = fmt(summary?.[field], unit);
  $("reading-count").textContent = number.format(summary?.count || 0);
}
function renderHistory(page) {
  state.total = page.total;
  const body = $("history");
  body.replaceChildren();
  if (!page.items.length) {
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "empty";
    cell.textContent = "No hay mediciones en este período.";
    const row = document.createElement("tr");
    row.append(cell);
    body.append(row);
  }
  for (const reading of page.items) {
    const row = document.createElement("tr");
    const values = [
      date.format(new Date(reading.measured_at)),
      ...Object.keys(units).map((field) => fmt(reading[field], units[field])),
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  $("page-label").textContent = page.total
    ? `${state.offset + 1}–${Math.min(state.offset + state.limit, page.total)} de ${number.format(page.total)} registros`
    : "0 registros";
}

function drawChart() {
  const metric = $("metric").value;
  const readings = [...state.chart].reverse();
  const valid = readings.filter((r) => r[metric] != null);
  const container = $("chart");
  if (!valid.length) {
    container.replaceChildren();
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No hay lecturas de esta variable en el período.";
    container.append(p);
    container.setAttribute("aria-label", p.textContent);
    return;
  }
  const width = 720,
    height = 220,
    left = 52,
    right = 15,
    top = 14,
    bottom = 35;
  const values = valid.map((r) => r[metric]);
  const low = Math.min(...values),
    high = Math.max(...values),
    padding = Math.max((high - low) * 0.15, 1);
  const min = low - padding,
    max = high + padding;
  const first = new Date(readings[0].measured_at).getTime(),
    last = new Date(readings.at(-1).measured_at).getTime();
  const x = (r) =>
    left +
    ((new Date(r.measured_at).getTime() - first) / (last - first || 1)) *
      (width - left - right);
  const y = (v) => top + ((max - v) / (max - min)) * (height - top - bottom);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  for (let i = 0; i < 5; i++) {
    const value = min + ((max - min) * i) / 4,
      pos = y(value);
    add("line", {
      x1: left,
      x2: width - right,
      y1: pos,
      y2: pos,
      stroke: "#e8ede3",
      "stroke-dasharray": "4 5",
    });
    add(
      "text",
      {
        x: left - 10,
        y: pos + 4,
        "text-anchor": "end",
        fill: "#7d887b",
        "font-size": 10,
      },
      fmt(value),
    );
  }
  let segment = [];
  const flush = () => {
    if (segment.length)
      add("polyline", {
        points: segment.join(" "),
        fill: "none",
        stroke: "#659149",
        "stroke-width": 2.5,
        "stroke-linejoin": "round",
      });
    segment = [];
  };
  for (const reading of readings) {
    if (reading[metric] == null) flush();
    else segment.push(`${x(reading)},${y(reading[metric])}`);
  }
  flush();
  for (const reading of valid) {
    const dot = add("circle", {
      cx: x(reading),
      cy: y(reading[metric]),
      r: valid.length < 80 ? 3 : 1.5,
      fill: "#659149",
    });
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent = `${date.format(new Date(reading.measured_at))}: ${fmt(reading[metric], units[metric])}`;
    dot.append(title);
  }
  const time = new Intl.DateTimeFormat(
    "es",
    Number($("range").value) > 24
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" },
  );
  add(
    "text",
    { x: left, y: height - 8, fill: "#7d887b", "font-size": 10 },
    time.format(new Date(first)),
  );
  if (last !== first)
    add(
      "text",
      {
        x: width - right,
        y: height - 8,
        "text-anchor": "end",
        fill: "#7d887b",
        "font-size": 10,
      },
      time.format(new Date(last)),
    );
  container.replaceChildren(svg);
  container.setAttribute(
    "aria-label",
    `${$("metric").selectedOptions[0].textContent}. ${valid.length} lecturas. Mínimo ${fmt(low, units[metric])}, máximo ${fmt(high, units[metric])}.`,
  );
}

async function loadStations() {
  const stations = await api("/api/stations");
  $("station").replaceChildren();
  for (const station of stations) {
    const option = document.createElement("option");
    option.value = station.id;
    option.textContent = station.name;
    option.dataset.location = station.location;
    $("station").append(option);
  }
  state.station = stations[0]?.id || "";
  state.stationsLoaded = true;
  if (!stations.length) {
    const option = document.createElement("option");
    option.textContent = "Sin estaciones registradas";
    $("station").append(option);
  }
}
async function refresh({ pageOnly = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  controls(true);
  try {
    if (!state.stationsLoaded) await loadStations();
    $("location").textContent =
      $("station").selectedOptions[0]?.dataset.location || "—";
    if (!state.station) {
      notice("Registra una estación a través de la API para comenzar.");
      status("Sin estaciones", "");
      return;
    }
    if (!pageOnly) state.dates = period();
    const historyPromise = api(
      "/api/measurements",
      params({ limit: state.limit, offset: state.offset }),
    );
    if (pageOnly) renderHistory(await historyPromise);
    else {
      const [latest, summary, history, chart] = await Promise.all([
        api(
          "/api/measurements/latest",
          new URLSearchParams({ station_id: state.station }),
        ).catch((e) => {
          if (e.status === 404) return null;
          throw e;
        }),
        api("/api/measurements/summary", params()),
        historyPromise,
        api("/api/measurements", params({ limit: 1000, offset: 0 })),
      ]);
      renderLatest(latest);
      renderSummary(summary);
      renderHistory(history);
      state.chart = chart.items;
      drawChart();
      $("chart-note").textContent =
        chart.total > 1000
          ? `Gráfico: últimas 1000 de ${number.format(chart.total)} lecturas del período. El resumen incluye todas.`
          : "Actualización cada 30 segundos · Horario del dispositivo";
      const stale =
        latest &&
        Date.now() - new Date(latest.measured_at).getTime() > 10 * 60000;
      status(
        latest
          ? stale
            ? "Sin lecturas recientes"
            : "Estación conectada"
          : "Esperando lecturas",
        latest && !stale ? "live" : "",
      );
    }
    notice("");
  } catch (error) {
    if (!state.stationsLoaded) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin conexión a la base";
      $("station").replaceChildren(option);
    }
    notice(
      error.message === "Failed to fetch"
        ? "No se pudo conectar. Revisa que el servidor esté en funcionamiento."
        : error.message,
    );
    status("Sin conexión", "error");
    renderLatest(null);
    renderSummary(null);
    state.chart = [];
    drawChart();
    renderHistory({ items: [], total: 0 });
  } finally {
    state.busy = false;
    controls(false);
  }
}
async function exportCsv() {
  if (!state.station || !state.dates || state.busy) return;
  $("export").disabled = true;
  try {
    const response = await fetch("/api/measurements/export?" + params(), {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "No se pudo exportar.");
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `ecored-${state.station}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("");
  } catch (error) {
    notice(error.message);
  } finally {
    $("export").disabled = false;
  }
}
$("station").addEventListener("change", () => {
  state.station = $("station").value;
  state.offset = 0;
  refresh();
});
$("range").addEventListener("change", () => {
  state.offset = 0;
  refresh();
});
$("metric").addEventListener("change", drawChart);
$("refresh").addEventListener("click", () => refresh());
$("previous").addEventListener("click", () => {
  state.offset = Math.max(0, state.offset - state.limit);
  refresh({ pageOnly: true });
});
$("next").addEventListener("click", () => {
  state.offset += state.limit;
  refresh({ pageOnly: true });
});
$("export").addEventListener("click", exportCsv);
$("timezone").textContent =
  "Zona horaria: " + Intl.DateTimeFormat().resolvedOptions().timeZone;
refresh();
setInterval(() => {
  if (!document.hidden && state.offset === 0) refresh();
}, 30000);
