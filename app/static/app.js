"use strict";
const $ = (id) => document.getElementById(id);

/*
 * Límites de los sensores de gas y UV, en lectura del ADC del ESP32 (0 a 4095).
 * Son valores orientativos: ajústelos según la calibración de sus sensores.
 * Por debajo de "atencion" se muestra verde; desde "peligro", rojo.
 */
const LIMITS = {
  mq2: { atencion: 1500, peligro: 2500 },
  mq135: { atencion: 1500, peligro: 2500 },
  mq9: { atencion: 1200, peligro: 2000 },
  // GUVA-S12SD a 3,3 V: ~375 equivale a índice UV 3 y ~750 a índice UV 6.
  uv: { atencion: 375, peligro: 750 },
};
const ADC_MAX = 4095;

const good = (label, advice) => ({ level: "good", label, advice });
const warn = (label, advice) => ({ level: "warn", label, advice });
const danger = (label, advice) => ({ level: "danger", label, advice });
const bySensor = (field, texts, top = danger) => (value) =>
  value >= LIMITS[field].peligro
    ? top(...texts.danger)
    : value >= LIMITS[field].atencion
      ? warn(...texts.warn)
      : good(...texts.good);

// Cómo se interpreta cada variable, en palabras sencillas.
const METRICS = {
  temperature: {
    name: "Temperatura",
    phrase: "la temperatura",
    unit: "°C",
    decimals: 1,
    normal: [12, 26],
    rate: (v) =>
      v < 5
        ? danger("Mucho frío", "Abríguese bien y temple la casa.")
        : v < 12
          ? warn("Frío", "Abríguese y cierre puertas y ventanas.")
          : v <= 26
            ? good("Agradable", "La temperatura es cómoda.")
            : v <= 31
              ? warn("Caluroso", "Beba agua y busque un lugar fresco.")
              : danger(
                  "Mucho calor",
                  "Beba agua seguido, evite el sol y descanse en un lugar fresco.",
                ),
  },
  humidity: {
    name: "Humedad",
    phrase: "la humedad",
    unit: "%",
    decimals: 0,
    normal: [30, 65],
    rate: (v) =>
      v < 30
        ? warn("Aire seco", "Beba agua. Puede ayudar un humidificador.")
        : v <= 65
          ? good("Normal", "La humedad del aire es adecuada.")
          : v <= 80
            ? warn("Húmedo", "Ventile la casa para evitar hongos.")
            : warn("Muy húmedo", "Ventile la casa y seque la ropa afuera."),
  },
  mq2: {
    name: "Gas y humo",
    phrase: "el nivel de gas y humo",
    sensor: true,
    rate: bySensor("mq2", {
      good: ["Normal", "No hay señales de gas ni humo."],
      warn: ["Elevado", "Abra una ventana y revise la cocina y las estufas."],
      danger: [
        "Peligro",
        "Abra puertas y ventanas, no encienda fuego ni enchufes y salga de la casa.",
      ],
    }),
  },
  mq135: {
    name: "Calidad del aire",
    phrase: "la calidad del aire",
    sensor: true,
    rate: bySensor("mq135", {
      good: ["Buena", "El aire está limpio."],
      warn: ["Regular", "Abra una ventana para renovar el aire."],
      danger: ["Mala", "Ventile bien y evite quedarse mucho rato en ese lugar."],
    }),
  },
  mq9: {
    name: "Monóxido de carbono",
    phrase: "el monóxido de carbono",
    sensor: true,
    rate: bySensor("mq9", {
      good: ["Normal", "No hay señales de monóxido."],
      warn: ["Elevado", "Ventile ahora y revise estufas, calefón y braseros."],
      danger: [
        "Peligro",
        "Salga de la casa y abra ventanas. Si siente mareo o dolor de cabeza, llame a emergencias.",
      ],
    }),
  },
  uv: {
    name: "Radiación del sol",
    phrase: "la radiación del sol",
    sensor: true,
    rate: bySensor("uv", {
      good: ["Baja", "No necesita protección especial."],
      warn: ["Moderada", "Si sale, use sombrero y protector solar."],
      danger: ["Alta", "Evite el sol directo. Use sombrero, lentes y protector solar."],
    },
    // El sol fuerte es un consejo, no una emergencia en casa: nunca pasa a rojo.
    warn),
  },
};
for (const [field, metric] of Object.entries(METRICS))
  if (metric.sensor) {
    metric.normal = [0, LIMITS[field].atencion];
    // Tramos verde, amarillo y rojo de la barra de cada sensor.
    const meter = document.getElementById(field);
    meter.style.setProperty("--a", (LIMITS[field].atencion / 4095) * 100 + "%");
    meter.style.setProperty("--p", (LIMITS[field].peligro / 4095) * 100 + "%");
  }

const ICONS = {
  good: "#i-good",
  warn: "#i-warn",
  danger: "#i-danger",
  wait: "#i-wait",
  error: "#i-off",
};
const RANK = { good: 0, warn: 1, danger: 2 };
const STALE_MINUTES = 10;

const number = (decimals = 1) =>
  new Intl.NumberFormat("es", { maximumFractionDigits: decimals });
const longDate = new Intl.DateTimeFormat("es", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});
const tableDate = new Intl.DateTimeFormat("es", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
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
  metric: "temperature",
  range: 24,
  latest: null,
  failed: false,
};

function show(field, value) {
  if (value == null) return "—";
  const metric = METRICS[field];
  if (metric?.sensor) return metric.rate(value).label;
  const text = number(metric?.decimals ?? 1).format(value);
  return metric?.unit ? `${text} ${metric.unit}` : text;
}
function ago(date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes === 1) return "hace 1 minuto";
  if (minutes < 60) return `hace ${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  return "el " + longDate.format(date);
}
function setPill(el, level, label) {
  el.dataset.level = level;
  el.replaceChildren();
  if (ICONS[level]) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", ICONS[level]);
    svg.append(use);
    el.append(svg);
  }
  el.append(label);
}

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
    start: new Date(end.getTime() - state.range * 3600000).toISOString(),
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
function controls(disabled) {
  for (const id of ["station", "refresh", "export"])
    $(id).disabled = disabled || (id === "export" && !state.station);
  for (const button of document.querySelectorAll(".choices button"))
    button.disabled = disabled;
  $("previous").disabled = disabled || state.offset === 0;
  $("next").disabled = disabled || state.offset + state.limit >= state.total;
}

function greet() {
  const hour = new Date().getHours();
  $("greeting").textContent =
    hour >= 5 && hour < 12
      ? "Buenos días"
      : hour >= 12 && hour < 20
        ? "Buenas tardes"
        : "Buenas noches";
}

function overall(level, title, text, issues = []) {
  const box = $("overall");
  box.dataset.level = level;
  $("overall-icon").setAttribute("href", ICONS[level]);
  $("overall-title").textContent = title;
  $("overall-text").textContent = text;
  const list = $("overall-list");
  list.replaceChildren();
  for (const issue of issues) {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = `${issue.name}: ${issue.label.toLowerCase()}.`;
    item.append(name, " " + issue.advice);
    list.append(item);
  }
}

function renderLatest(row) {
  state.latest = row;
  const issues = [];
  for (const [field, metric] of Object.entries(METRICS)) {
    const card = document.querySelector(`.metric[data-metric="${field}"]`);
    const value = row?.[field];
    const rating = value == null ? null : metric.rate(value);
    card.dataset.level = rating?.level || "none";
    setPill(
      $(field + "-status"),
      rating?.level || "none",
      rating?.label || "Sin datos",
    );
    $(field + "-advice").textContent = rating?.advice || "";
    if (metric.sensor) {
      const share = value == null ? 0 : Math.min(value / ADC_MAX, 1);
      $(field).firstElementChild.style.left = `${share * 100}%`;
      $(field).classList.toggle("empty-meter", value == null);
    } else $(field).textContent = show(field, value);
    if (rating && rating.level !== "good")
      issues.push({ ...rating, name: metric.name });
  }
  issues.sort((a, b) => RANK[b.level] - RANK[a.level]);
  renderTech(row);
  renderUpdated();

  if (!row)
    return overall(
      "wait",
      "Todavía no hay mediciones",
      "Cuando la estación envíe su primera medición, la verá aquí.",
    );
  const minutes = (Date.now() - new Date(row.measured_at).getTime()) / 60000;
  if (minutes > STALE_MINUTES)
    return overall(
      "wait",
      "La estación no está enviando datos",
      `La última medición llegó ${ago(new Date(row.measured_at))}. Revise que la estación esté encendida y cerca del receptor. Los valores de abajo pueden no estar al día.`,
    );
  if (!issues.length)
    return overall(
      "good",
      "Todo está bien",
      "El ambiente de su hogar está en buenas condiciones.",
    );
  if (issues[0].level === "danger")
    return overall(
      "danger",
      "¡Cuidado! Hay un peligro",
      "Siga estas indicaciones ahora:",
      issues,
    );
  overall(
    "warn",
    "Ponga atención",
    issues.length === 1
      ? "Hay algo que conviene revisar:"
      : "Hay algunas cosas que conviene revisar:",
    issues,
  );
}
function renderUpdated() {
  const row = state.latest;
  $("updated").textContent = state.failed
    ? "Sin conexión"
    : row
      ? "Última medición: " + ago(new Date(row.measured_at))
      : "Esperando datos…";
}
function renderTech(row) {
  const rssi = row?.rssi;
  $("rssi").textContent = rssi == null ? "—" : `${number().format(rssi)} dBm`;
  $("snr").textContent =
    row?.snr == null ? "—" : `${number().format(row.snr)} dB`;
  $("signal-quality").textContent =
    rssi == null
      ? "—"
      : rssi > -110
        ? "Buena"
        : rssi > -125
          ? "Regular"
          : "Débil: acerque la estación al receptor";
  $("raw-readings").textContent = row
    ? ["mq2", "mq135", "mq9", "uv"]
        .map(
          (f) =>
            `${METRICS[f].name}: ${row[f] == null ? "—" : number(0).format(row[f])}`,
        )
        .join(" · ")
    : "—";
}

function renderSummary(summary) {
  const temp = (v) => show("temperature", v);
  for (const [id, value] of [
    ["temp-min", temp(summary?.temperature_min)],
    ["temp-max", temp(summary?.temperature_max)],
    ["temp-avg", temp(summary?.temperature_avg)],
    ["humidity-avg", show("humidity", summary?.humidity_avg)],
  ])
    $(id).textContent = value;
  for (const [id, field, key] of [
    ["mq2-avg", "mq2", "mq2_avg"],
    ["mq135-avg", "mq135", "mq135_avg"],
    ["mq9-avg", "mq9", "mq9_avg"],
    ["uv-max", "uv", "uv_max"],
  ]) {
    const value = summary?.[key];
    if (value == null) {
      $(id).className = "";
      $(id).textContent = "—";
    } else {
      const rating = METRICS[field].rate(value);
      $(id).className = "pill small";
      setPill($(id), rating.level, rating.label);
    }
  }
  $("reading-count").textContent = number(0).format(summary?.count || 0);
}

function renderHistory(page) {
  state.total = page.total;
  const body = $("history");
  body.replaceChildren();
  if (!page.items.length) {
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty";
    cell.textContent = "No hay mediciones en este período.";
    const row = document.createElement("tr");
    row.append(cell);
    body.append(row);
  }
  for (const reading of page.items) {
    const row = document.createElement("tr");
    const date = document.createElement("td");
    date.textContent = tableDate.format(new Date(reading.measured_at));
    row.append(date);
    for (const field of Object.keys(METRICS)) {
      const cell = document.createElement("td");
      const value = reading[field];
      if (METRICS[field].sensor && value != null) {
        const span = document.createElement("span");
        const rating = METRICS[field].rate(value);
        span.className = "pill small";
        setPill(span, rating.level, rating.label);
        cell.append(span);
      } else cell.textContent = show(field, value);
      row.append(cell);
    }
    body.append(row);
  }
  $("page-label").textContent = page.total
    ? `${state.offset + 1} a ${Math.min(state.offset + state.limit, page.total)} de ${number(0).format(page.total)}`
    : "0 mediciones";
}

function chartSummary(metric, valid) {
  const info = METRICS[metric];
  if (!valid.length) return "";
  const values = valid.map((r) => r[metric]);
  const subject = info.phrase[0].toUpperCase() + info.phrase.slice(1);
  if (!info.sensor)
    return `${subject} estuvo entre ${show(metric, Math.min(...values))} y ${show(metric, Math.max(...values))}.`;
  const ratings = values.map(info.rate);
  const worst = ratings.reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
  if (worst.level === "good")
    return `${subject} se mantuvo en «${worst.label.toLowerCase()}» todo el tiempo.`;
  const count = ratings.filter((r) => r.level === worst.level).length;
  return `${subject} llegó a «${worst.label.toLowerCase()}» en ${count} ${count === 1 ? "medición" : "mediciones"}.`;
}

function drawChart() {
  const metric = state.metric;
  const info = METRICS[metric];
  const readings = [...state.chart].reverse();
  const valid = readings.filter((r) => r[metric] != null);
  const container = $("chart");
  container.dataset.metric = metric;
  $("chart-summary").textContent = chartSummary(metric, valid);
  if (!valid.length) {
    container.replaceChildren();
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No hay mediciones de este dato en el período elegido.";
    container.append(p);
    container.setAttribute("aria-label", p.textContent);
    return;
  }
  // Dibujar al tamaño real del contenedor para que el texto se lea bien.
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const font = Math.round(rem * 0.875);
  const width = Math.max(container.clientWidth, 280),
    height = Math.max(container.clientHeight, 200),
    left = info.sensor ? 12 : font * 4.4,
    right = 14,
    top = 14,
    bottom = font * 2.6;
  const values = valid.map((r) => r[metric]);
  const low = Math.min(...values),
    high = Math.max(...values);
  let min, max;
  if (info.sensor) {
    // Escala fija desde cero que incluye el límite de peligro: así se ve lo lejos que está.
    min = 0;
    max = Math.max(LIMITS[metric].peligro * 1.1, high * 1.1);
  } else {
    const padding = Math.max((high - low) * 0.15, 1);
    min = low - padding;
    max = high + padding;
  }
  const first = new Date(readings[0].measured_at).getTime(),
    last = new Date(readings.at(-1).measured_at).getTime();
  const x = (r) =>
    left +
    ((new Date(r.measured_at).getTime() - first) / (last - first || 1)) *
      (width - left - right);
  const y = (v) => top + ((max - v) / (max - min)) * (height - top - bottom);
  const base = height - bottom;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.fontSize = font + "px";
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(svg.namespaceURI, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  const gradient = add("linearGradient", {
    id: "chart-fill",
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 1,
  });
  for (const [offset, opacity] of [
    [0, 0.3],
    [1, 0],
  ]) {
    const stop = document.createElementNS(svg.namespaceURI, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("stop-opacity", opacity);
    gradient.append(stop);
  }

  // Franja verde con la zona normal.
  const [bandLow, bandHigh] = info.normal;
  const bandTop = y(Math.min(bandHigh, max)),
    bandBottom = y(Math.max(bandLow, min));
  if (bandBottom > bandTop)
    add("rect", {
      x: left,
      y: bandTop,
      width: width - left - right,
      height: bandBottom - bandTop,
      class: "band",
    });
  if (info.sensor) {
    for (const [limit, cls, text] of [
      [LIMITS[metric].atencion, "limit warn", "Atención"],
      [LIMITS[metric].peligro, "limit danger", "Peligro"],
    ]) {
      add("line", { x1: left, x2: width - right, y1: y(limit), y2: y(limit), class: cls });
      add(
        "text",
        { x: width - right - 4, y: y(limit) - 6, "text-anchor": "end", class: "limit-label " + cls },
        text,
      );
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const value = min + ((max - min) * i) / 4,
        pos = y(value);
      add("line", { x1: left, x2: width - right, y1: pos, y2: pos, class: "grid" });
      add(
        "text",
        { x: left - 8, y: pos + font * 0.35, "text-anchor": "end", class: "axis" },
        show(metric, value),
      );
    }
  }

  let segment = [];
  const flush = () => {
    if (segment.length) {
      const [firstX] = segment[0],
        [lastX] = segment.at(-1);
      add("polygon", {
        points: `${firstX},${base} ${segment.join(" ")} ${lastX},${base}`,
        class: "area",
      });
      add("polyline", { points: segment.join(" "), class: "line" });
    }
    segment = [];
  };
  for (const reading of readings) {
    if (reading[metric] == null) flush();
    else segment.push([x(reading), y(reading[metric])]);
  }
  flush();
  const describe = (reading) =>
    `${tableDate.format(new Date(reading.measured_at))}: ${show(metric, reading[metric])}`;
  for (const reading of valid) {
    const latest = reading === valid.at(-1);
    if (!latest && valid.length > 60) continue;
    const dot = add("circle", {
      cx: x(reading),
      cy: y(reading[metric]),
      r: latest ? 7 : 3.5,
      class: latest ? "latest" : "point",
    });
    const title = document.createElementNS(svg.namespaceURI, "title");
    title.textContent = describe(reading);
    dot.append(title);
  }

  // Marcas de hora en el eje inferior.
  const time = new Intl.DateTimeFormat(
    "es",
    state.range > 24
      ? { weekday: "short", day: "numeric" }
      : { hour: "2-digit", minute: "2-digit" },
  );
  const ticks = last === first ? 1 : width < 500 ? 3 : 5;
  for (let i = 0; i < ticks; i++) {
    const t = ticks === 1 ? first : first + ((last - first) * i) / (ticks - 1);
    const anchor = ticks === 1 || i === 0 ? "start" : i === ticks - 1 ? "end" : "middle";
    add(
      "text",
      {
        x: ticks === 1 ? left : left + ((width - left - right) * i) / (ticks - 1),
        y: height - font * 0.7,
        "text-anchor": anchor,
        class: "axis",
      },
      time.format(new Date(t)),
    );
  }
  container.replaceChildren(svg);
  container.setAttribute(
    "aria-label",
    `Gráfico de ${info.name.toLowerCase()}. ${$("chart-summary").textContent}`,
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
  $("station-picker").hidden = stations.length < 2;
  if (!stations.length) {
    const option = document.createElement("option");
    option.textContent = "Sin estaciones registradas";
    $("station").append(option);
  }
}
function renderStation() {
  const option = $("station").selectedOptions[0];
  $("station-name").textContent = state.station
    ? option?.textContent || ""
    : "Sin estación registrada";
  $("location").textContent = option?.dataset.location
    ? " · " + option.dataset.location
    : "";
}

async function refresh({ pageOnly = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  controls(true);
  try {
    if (!state.stationsLoaded) await loadStations();
    renderStation();
    if (!state.station) {
      overall(
        "wait",
        "Falta registrar una estación",
        "Pida a quien instaló Eco-Red que registre la estación para empezar.",
      );
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
      state.failed = false;
      renderLatest(latest);
      renderSummary(summary);
      renderHistory(history);
      state.chart = chart.items;
      drawChart();
    }
    notice("");
  } catch (error) {
    state.failed = true;
    if (!state.stationsLoaded) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Sin conexión";
      $("station").replaceChildren(option);
      $("station-name").textContent = "Sin conexión con el servidor";
    }
    renderLatest(null);
    overall(
      "error",
      "No se pudo conectar",
      "Revise que el computador o equipo de Eco-Red esté encendido y conectado a internet. La página lo intentará de nuevo sola en 30 segundos.",
    );
    if (error.message !== "Failed to fetch") notice("Detalle: " + error.message);
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
      throw new Error(data.detail || "No se pudo descargar la planilla.");
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

function choiceGroup(id, onChange) {
  const buttons = [...$(id).querySelectorAll("button")];
  for (const button of buttons)
    button.addEventListener("click", () => {
      for (const other of buttons)
        other.setAttribute("aria-pressed", String(other === button));
      onChange(button.dataset.value);
    });
}
choiceGroup("metric-choices", (value) => {
  state.metric = value;
  drawChart();
});
choiceGroup("range-choices", (value) => {
  state.range = Number(value);
  state.offset = 0;
  refresh();
});

function applyTextSize(large) {
  document.documentElement.classList.toggle("large-text", large);
  $("text-size").setAttribute("aria-pressed", String(large));
  $("text-size-label").textContent = large ? "Letra normal" : "Agrandar letra";
}
$("text-size").addEventListener("click", () => {
  const large = !document.documentElement.classList.contains("large-text");
  applyTextSize(large);
  try {
    localStorage.setItem("ecored-letra", large ? "grande" : "normal");
  } catch (e) {
    // Sin almacenamiento: el cambio dura hasta cerrar la página.
  }
  if (state.chart.length) drawChart();
});
applyTextSize(document.documentElement.classList.contains("large-text"));

$("station").addEventListener("change", () => {
  state.station = $("station").value;
  state.offset = 0;
  refresh();
});
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
let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (state.chart.length) drawChart();
  });
}).observe($("chart"));

$("timezone").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
greet();
refresh();
setInterval(() => {
  greet();
  renderUpdated();
  if (!document.hidden && state.offset === 0) refresh();
}, 30000);
