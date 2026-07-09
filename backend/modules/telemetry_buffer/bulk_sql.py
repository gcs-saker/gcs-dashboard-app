from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert

from model.telemetry_model import TelemetryCreate
from modules.telemetry_buffer.buffer import TelemetryBufferRecord
from modules.telemetry_buffer.storage_contract import (
    HISTORY_ROW_COLUMNS,
    LATEST_ROW_COLUMNS,
    TelemetrySqlDialect,
    TelemetryStorageColumns,
    TelemetryStorageTables,
    telemetry_history_table,
)
from sql.telemetry_sql import Telemetry

__all__ = [
    "HISTORY_ROW_COLUMNS",
    "TelemetryBulkBatch",
    "TelemetryBulkPayload",
    "TelemetryBulkWritePlan",
    "TelemetrySqlDialect",
    "TelemetryStorageTables",
    "build_mysql_latest_bulk_upsert",
    "build_postgres_history_bulk_insert",
    "build_postgres_latest_bulk_upsert",
    "plan_mysql_latest_bulk_write",
    "plan_postgres_bulk_write",
]


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
