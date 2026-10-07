CREATE TABLE IF NOT EXISTS stations (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS measurements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    station_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sample_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    measured_at DATETIME(6) NOT NULL,
    received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    temperature DOUBLE NULL,
    humidity DOUBLE NULL,
    mq2 SMALLINT UNSIGNED NULL,
    mq135 SMALLINT UNSIGNED NULL,
    mq9 SMALLINT UNSIGNED NULL,
    uv SMALLINT UNSIGNED NULL,
    rssi DOUBLE NULL,
    snr DOUBLE NULL,
    pressure DOUBLE NULL,
    wind_speed DOUBLE NULL,
    wind_direction DOUBLE NULL,
    rainfall DOUBLE NULL,
    CONSTRAINT fk_measurement_station FOREIGN KEY (station_id) REFERENCES stations(id),
    UNIQUE KEY uq_station_time (station_id, measured_at),
    UNIQUE KEY uq_station_sample (station_id, sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO stations (id, name, location)
VALUES ('EST-001', 'Estación principal', 'Ubicación por configurar');
