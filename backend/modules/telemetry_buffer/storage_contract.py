from __future__ import annotations

from typing import Final

from sqlalchemy import Column, DateTime, Float, MetaData, String, Table


class TelemetrySqlDialect:
    MYSQL: Final = "mysql"
    MARIADB: Final = "mariadb"
    POSTGRESQL: Final = "postgresql"


class TelemetryStorageTables:
    LATEST: Final = "telemetry_realtime"
    HISTORY: Final = "telemetry_history"
    LATEST_MATERIALIZED_VIEW: Final = "telemetry_latest_mv"


class TelemetryStorageColumns:
    UUID: Final = "uuid"
    STREAM_UUID: Final = "stream_uuid"
    LATITUDE: Final = "latitude"
    LONGITUDE: Final = "longitude"
    ALTITUDE: Final = "altitude"
    MAGNETIC_X: Final = "magneticX"
    MAGNETIC_Y: Final = "magneticY"
    MAGNETIC_Z: Final = "magneticZ"
    SOC: Final = "soc"
    PHONE_BATTERY_SOC: Final = "phoneBatterySOC"
    VELOCITY: Final = "velocity"
    TOTAL_DISTANCE: Final = "totalDistance"
    EPOCH_TIME: Final = "epochTime"
    PORT_DISTANCE: Final = "portDistance"
    RECEIVED_AT: Final = "received_at"


LATEST_ROW_COLUMNS: Final[tuple[str, ...]] = (
    TelemetryStorageColumns.UUID,
    TelemetryStorageColumns.LATITUDE,
    TelemetryStorageColumns.LONGITUDE,
    TelemetryStorageColumns.ALTITUDE,
    TelemetryStorageColumns.MAGNETIC_X,
    TelemetryStorageColumns.MAGNETIC_Y,
    TelemetryStorageColumns.MAGNETIC_Z,
    TelemetryStorageColumns.SOC,
    TelemetryStorageColumns.PHONE_BATTERY_SOC,
    TelemetryStorageColumns.VELOCITY,
    TelemetryStorageColumns.TOTAL_DISTANCE,
    TelemetryStorageColumns.EPOCH_TIME,
    TelemetryStorageColumns.PORT_DISTANCE,
)

HISTORY_ROW_COLUMNS: Final[tuple[str, ...]] = (
    TelemetryStorageColumns.STREAM_UUID,
    TelemetryStorageColumns.LATITUDE,
    TelemetryStorageColumns.LONGITUDE,
    TelemetryStorageColumns.ALTITUDE,
    TelemetryStorageColumns.VELOCITY,
    TelemetryStorageColumns.EPOCH_TIME,
    TelemetryStorageColumns.RECEIVED_AT,
)

telemetry_history_table = Table(
    TelemetryStorageTables.HISTORY,
    MetaData(),
    Column(TelemetryStorageColumns.STREAM_UUID, String(64), nullable=False),
    Column(TelemetryStorageColumns.LATITUDE, Float),
    Column(TelemetryStorageColumns.LONGITUDE, Float),
    Column(TelemetryStorageColumns.ALTITUDE, Float),
    Column(TelemetryStorageColumns.VELOCITY, Float),
    Column(TelemetryStorageColumns.EPOCH_TIME, Float),
    Column(TelemetryStorageColumns.RECEIVED_AT, DateTime(timezone=True), nullable=False),
)
