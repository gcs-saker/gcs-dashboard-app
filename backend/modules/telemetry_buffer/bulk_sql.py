from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from sqlalchemy import Column, DateTime, Float, MetaData, String, Table
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert

from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer.buffer import TelemetryBufferRecord
from sql.telemetry_sql import Telemetry


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


@dataclass(frozen=True)
class TelemetryBulkPayload:
    uuid: str
    telemetry: TelemetryCreate
    received_at: datetime

    @classmethod
    def from_record(cls, record: TelemetryBufferRecord) -> "TelemetryBulkPayload":
        if not record.key:
            raise ValueError("telemetry uuid is required for bulk persistence")
        return cls(uuid=record.key, telemetry=record.telemetry, received_at=record.received_at)

    def to_latest_row(self) -> dict[str, Any]:
        row = self.telemetry.model_dump(exclude_unset=True)
        row[TelemetryStorageColumns.UUID] = self.uuid
        return {column: row.get(column) for column in LATEST_ROW_COLUMNS if column in row}

    def to_history_row(self) -> dict[str, Any]:
        row = self.telemetry.model_dump(exclude_unset=True)
        return {
            TelemetryStorageColumns.STREAM_UUID: self.uuid,
            TelemetryStorageColumns.LATITUDE: row.get(TelemetryStorageColumns.LATITUDE),
            TelemetryStorageColumns.LONGITUDE: row.get(TelemetryStorageColumns.LONGITUDE),
            TelemetryStorageColumns.ALTITUDE: row.get(TelemetryStorageColumns.ALTITUDE),
            TelemetryStorageColumns.VELOCITY: row.get(TelemetryStorageColumns.VELOCITY),
            TelemetryStorageColumns.EPOCH_TIME: row.get(TelemetryStorageColumns.EPOCH_TIME),
            TelemetryStorageColumns.RECEIVED_AT: self.received_at,
        }


@dataclass(frozen=True)
class TelemetryBulkBatch:
    payloads: tuple[TelemetryBulkPayload, ...]

    @classmethod
    def from_records(cls, records: Iterable[TelemetryBufferRecord]) -> "TelemetryBulkBatch":
        payloads = tuple(TelemetryBulkPayload.from_record(record) for record in records)
        return cls(payloads=payloads)

    def __len__(self) -> int:
        return len(self.payloads)

    def is_empty(self) -> bool:
        return not self.payloads

    def latest_rows(self) -> list[dict[str, Any]]:
        return [payload.to_latest_row() for payload in self.payloads]

    def history_rows(self) -> list[dict[str, Any]]:
        return [payload.to_history_row() for payload in self.payloads]


@dataclass(frozen=True)
class TelemetryBulkWritePlan:
    record_count: int
    latest_statement_count: int
    history_statement_count: int
    previous_row_loop_statement_count: int

    @property
    def total_statement_count(self) -> int:
        return self.latest_statement_count + self.history_statement_count

    @property
    def avoided_statement_count(self) -> int:
        return max(self.previous_row_loop_statement_count - self.total_statement_count, 0)


def plan_postgres_bulk_write(batch: TelemetryBulkBatch) -> TelemetryBulkWritePlan:
    record_count = len(batch)
    return TelemetryBulkWritePlan(
        record_count=record_count,
        latest_statement_count=1 if record_count else 0,
        history_statement_count=1 if record_count else 0,
        previous_row_loop_statement_count=record_count,
    )


def plan_mysql_latest_bulk_write(batch: TelemetryBulkBatch) -> TelemetryBulkWritePlan:
    record_count = len(batch)
    return TelemetryBulkWritePlan(
        record_count=record_count,
        latest_statement_count=1 if record_count else 0,
        history_statement_count=0,
        previous_row_loop_statement_count=record_count,
    )


def build_postgres_latest_bulk_upsert(batch: TelemetryBulkBatch) -> Any:
    rows = batch.latest_rows()
    statement = postgres_insert(Telemetry).values(rows)
    update_columns = {
        column_name: getattr(statement.excluded, column_name)
        for column_name in LATEST_ROW_COLUMNS
        if column_name != TelemetryStorageColumns.UUID
    }
    return statement.on_conflict_do_update(
        index_elements=[TelemetryStorageColumns.UUID],
        set_=update_columns,
    )


def build_postgres_history_bulk_insert(batch: TelemetryBulkBatch) -> Any:
    return postgres_insert(telemetry_history_table).values(batch.history_rows())


def build_mysql_latest_bulk_upsert(batch: TelemetryBulkBatch) -> Any:
    rows = batch.latest_rows()
    statement = mysql_insert(Telemetry).values(rows)
    update_columns = {
        column_name: getattr(statement.inserted, column_name)
        for column_name in LATEST_ROW_COLUMNS
        if column_name != TelemetryStorageColumns.UUID
    }
    return statement.on_duplicate_key_update(**update_columns)
