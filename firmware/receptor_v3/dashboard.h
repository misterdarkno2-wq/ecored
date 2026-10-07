#pragma once

const char PAGINA[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width, initial-scale=1.0">

<title>ECORED</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    background: #07111f;
    color: white;
}

header {
    padding: 25px;
    text-align: center;
    background: #0d1b2a;
    border-bottom: 1px solid #1d3557;
}

header h1 {
    margin: 0;
    font-size: 32px;
}

header p {
    margin-top: 8px;
    color: #9fb3c8;
}

.estado {
    display: inline-block;
    margin-top: 10px;
    padding: 7px 14px;
    border-radius: 20px;
    background: #163c2c;
    color: #6fffa8;
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
    background: #101f33;
    padding: 22px;
    border-radius: 14px;
    border: 1px solid #213954;
}

.nombre {
    color: #8da6bf;
    font-size: 14px;
}

.valor {
    font-size: 32px;
    font-weight: bold;
    margin-top: 8px;
}

.unidad {
    font-size: 15px;
    color: #8da6bf;
}

.seccion {
    margin-top: 25px;
    background: #101f33;
    padding: 20px;
    border-radius: 14px;
    border: 1px solid #213954;
}

.seccion h2 {
    margin-top: 0;
}

.info {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    border-bottom: 1px solid #1d3148;
}

.info:last-child {
    border-bottom: none;
}

footer {
    text-align: center;
    color: #667d94;
    padding: 25px;
}

</style>

</head>

<body>

<header>

<h1>🌱 ECORED</h1>

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
ECORED • Sistema de monitoreo ambiental
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
                "● ECORED EN LÍNEA";

            estado.style.background =
                "#163c2c";

            estado.style.color =
                "#6fffa8";

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
