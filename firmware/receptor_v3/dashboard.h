#pragma once

const char PAGINA[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>Eco-Red · Receptor</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: "Segoe UI", system-ui, Arial, sans-serif;
    background: #0b170b;
    color: white;
}

header {
    padding: 25px;
    text-align: center;
    background: linear-gradient(100deg, #0f3a12, #1d5410);
    border-bottom: 4px solid #8ed13d;
}

header h1 {
    margin: 0;
    font-size: 32px;
    color: #ffe85c;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}

.logo {
    width: 52px;
    height: 45px;
}

header p {
    margin-top: 8px;
    color: #c6e89a;
}

.estado {
    display: inline-block;
    margin-top: 10px;
    padding: 7px 14px;
    border-radius: 20px;
    background: #ffe85c;
    color: #0f3a12;
    font-weight: bold;
}

.contenedor {
    max-width: 1100px;
    margin: auto;
    padding: 25px;
}

.grid {
    display: grid;
    grid-template-columns:
        repeat(auto-fit, minmax(190px, 1fr));
    gap: 16px;
}

.card {
    background: #122313;
    padding: 22px;
    border-radius: 16px;
    border: 1px solid #23401f;
    border-top: 4px solid #8ed13d;
}

.card:nth-child(even) {
    border-top-color: #ffe85c;
}

.nombre {
    color: #a3b896;
    font-size: 14px;
}

.valor {
    font-size: 32px;
    font-weight: bold;
    margin-top: 8px;
}

.unidad {
    font-size: 15px;
    color: #8ed13d;
}

.seccion {
    margin-top: 25px;
    background: #122313;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid #23401f;
}

.seccion h2 {
    margin-top: 0;
    color: #8ed13d;
}

.info {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid #23401f;
}

.info:last-child {
    border-bottom: none;
}

footer {
    text-align: center;
    color: #a3b896;
    padding: 25px;
}

</style>

</head>

<body>

<header>

<h1><svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 86.6" aria-hidden="true">
<defs>
<clipPath id="ecored-hex"><path d="M97.4 38.8a9 9 0 0 1 0 9L77.6 82.1a9 9 0 0 1-7.8 4.5H30.2a9 9 0 0 1-7.8-4.5L2.6 47.8a9 9 0 0 1 0-9L22.4 4.5A9 9 0 0 1 30.2 0h39.6a9 9 0 0 1 7.8 4.5Z"/></clipPath>
</defs>
<g clip-path="url(#ecored-hex)" stroke="#1d5410" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
<rect width="100" height="86.6" fill="#8ed13d" stroke="none"/>
<path fill="#ffe85c" stroke="none" d="M-2 59C4 53 9 50.5 14.5 50.5S23.4 52 25 57C26.6 52 29.0 45 37.5 45S48.4 52 50 57C51.6 52 54.0 45 62.5 45S73.4 52 75 57C76.6 52 80 50.5 85.5 50.5S96 53 102 59V90H-2Z"/>
<path fill="none" d="M-2 59C4 53 9 50.5 14.5 50.5S23.4 52 25 57C27.2 60 29.4 62 29.4 65.5C29.4 69.5 27.4 72 25 72S20.6 69.5 20.6 65.5S22.8 60 25 57C26.6 52 29.0 45 37.5 45S48.4 52 50 57C52.2 60 54.4 62 54.4 65.5C54.4 69.5 52.4 72 50 72S45.6 69.5 45.6 65.5S47.8 60 50 57C51.6 52 54.0 45 62.5 45S73.4 52 75 57C77.2 60 79.4 62 79.4 65.5C79.4 69.5 77.4 72 75 72S70.6 69.5 70.6 65.5S72.8 60 75 57C76.6 52 80 50.5 85.5 50.5S96 53 102 59"/>
<g fill="#ffe85c">
<ellipse cx="14.5" cy="41.2" rx="7" ry="8.2"/>
<ellipse cx="37" cy="35.4" rx="7.2" ry="8.5"/>
<ellipse cx="63" cy="35.4" rx="7.2" ry="8.5"/>
<ellipse cx="85.5" cy="41.2" rx="7" ry="8.2"/>
</g>
</g>
</svg>
Eco-Red</h1>

<p>Red de monitoreo ambiental</p>

<div class="estado" id="estado">
Conectando...
</div>

</header>

<div class="contenedor">

<div class="grid">

<div class="card">
<div class="nombre">TEMPERATURA</div>
<div class="valor">
<span id="temp">--</span>
<span class="unidad">°C</span>
</div>
</div>

<div class="card">
<div class="nombre">HUMEDAD</div>
<div class="valor">
<span id="hum">--</span>
<span class="unidad">%</span>
</div>
</div>

<div class="card">
<div class="nombre">MQ2</div>
<div class="valor" id="mq2">--</div>
</div>

<div class="card">
<div class="nombre">MQ135</div>
<div class="valor" id="mq135">--</div>
</div>

<div class="card">
<div class="nombre">MQ9</div>
<div class="valor" id="mq9">--</div>
</div>

<div class="card">
<div class="nombre">UV · ADC</div>
<div class="valor" id="uv">--</div>
</div>

</div>


<div class="seccion">

<h2>📡 Enlace LoRa</h2>

<div class="info">
<span>RSSI</span>
<strong>
<span id="rssi">--</span> dBm
</strong>
</div>

<div class="info">
<span>SNR</span>
<strong>
<span id="snr">--</span> dB
</strong>
</div>

<div class="info">
<span>Frecuencia</span>
<strong>905.2 MHz</strong>
</div>

<div class="info">
<span>Bandwidth</span>
<strong>250 kHz</strong>
</div>

<div class="info">
<span>Spreading Factor</span>
<strong>SF12</strong>
</div>

</div>


<div class="seccion">

<h2>⚙️ Estado del sistema</h2>
<div class="info"><span>FastAPI · último HTTP</span><strong id="api-http">--</strong></div>
<div class="info"><span>Cola de envío</span><strong id="api-pending">--</strong></div>
<div class="info"><span>Descartados por cola llena</span><strong id="api-dropped">--</strong></div>
<div class="info"><span>Rechazados por API</span><strong id="api-rejected">--</strong></div>

<div class="info">
<span>Nodo sensores</span>
<strong>WROOM32</strong>
</div>

<div class="info">
<span>Puente</span>
<strong>Heltec V4</strong>
</div>

<div class="info">
<span>Receptor</span>
<strong>Heltec V3</strong>
</div>

<div class="info">
<span>Último paquete</span>
<strong>
<span id="tiempo">--</span> s
</strong>
</div>

</div>

</div>

<footer>
Eco-Red • Sistema de monitoreo ambiental
</footer>


<script>

async function actualizar() {

    try {

        const respuesta =
            await fetch('/datos');

        const d =
            await respuesta.json();

        document.getElementById("temp").innerText =
            (d.temperatura == null ? "--" : d.temperatura.toFixed(1));

        document.getElementById("hum").innerText =
            (d.humedad == null ? "--" : d.humedad.toFixed(1));

        document.getElementById("mq2").innerText =
            (d.mq2 == null ? "--" : d.mq2);

        document.getElementById("mq135").innerText =
            (d.mq135 == null ? "--" : d.mq135);

        document.getElementById("mq9").innerText =
            (d.mq9 == null ? "--" : d.mq9);

        document.getElementById("uv").innerText =
            (d.uv == null ? "--" : d.uv);

        document.getElementById("rssi").innerText =
            (d.rssi == null ? "--" : d.rssi.toFixed(1));

        document.getElementById("snr").innerText =
            (d.snr == null ? "--" : d.snr.toFixed(1));

        document.getElementById("tiempo").innerText =
            d.segundos;

        document.getElementById("api-http").innerText = d.api_http;
        document.getElementById("api-pending").innerText = d.pendientes;
        document.getElementById("api-dropped").innerText = d.descartados_cola;
        document.getElementById("api-rejected").innerText = d.rechazados_api;

        const estado =
            document.getElementById("estado");

        if(d.online) {

            estado.innerText =
                "● ECO-RED EN LÍNEA";

            estado.style.background =
                "#ffe85c";

            estado.style.color =
                "#0f3a12";

        } else {

            estado.innerText =
                "● SIN DATOS";

            estado.style.background =
                "#482020";

            estado.style.color =
                "#ff8a8a";
        }

    }

    catch(error) {

        document.getElementById("estado").innerText =
            "● SIN CONEXIÓN";
    }
}

setInterval(actualizar, 1000);

actualizar();

</script>

</body>
</html>
)rawliteral";
