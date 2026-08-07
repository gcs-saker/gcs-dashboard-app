from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.dialects.postgresql import Insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.orm import Session

from model.telemetry_model import TelemetryCreate, TelemetryResponse
from sql.telemetry_sql import Telemetry


@dataclass(frozen=True)
class TelemetryIngestCommand:
    payload: TelemetryCreate

    @classmethod
    def from_create(cls, payload: TelemetryCreate) -> "TelemetryIngestCommand":
        return cls(payload=payload)

    @classmethod
    def coerce(cls, command_or_payload: "TelemetryIngestCommand | TelemetryCreate") -> "TelemetryIngestCommand":
        if isinstance(command_or_payload, TelemetryIngestCommand):
            return command_or_payload
        return cls.from_create(command_or_payload)

    def db_insert_payload(self) -> dict[str, object | None]:
        return self.payload.model_dump()

    def db_update_payload(self) -> dict[str, object | None]:
        return self.payload.model_dump(exclude_unset=True)

    def response_snapshot(self) -> TelemetryResponse:
        return TelemetryResponse(
            **{
                **self.payload.model_dump(),
                "epochTime": format_epoch_millis(self.payload.epoch_time),
            }
        )


@dataclass
class TelemetryReadModelStore:
    snapshots: dict[str | None, TelemetryResponse] = field(default_factory=dict)

    def upsert(self, command: TelemetryIngestCommand) -> TelemetryResponse:
        snapshot = command.response_snapshot()
        self.snapshots[command.payload.uuid] = snapshot
        return snapshot

    def list(self) -> list[TelemetryResponse]:
        return list(self.snapshots.values())


class TelemetryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def upsert(self, command_or_payload: TelemetryIngestCommand | TelemetryCreate) -> Telemetry:
        command = TelemetryIngestCommand.coerce(command_or_payload)
        if self._is_postgres_session():
            return self._upsert_postgres(command)
        return self._upsert_orm(command)

    def _upsert_postgres(self, command: TelemetryIngestCommand) -> Telemetry:
        self.db.execute(_build_postgres_telemetry_upsert(command.db_update_payload()))
        self.db.commit()
        db_obj = self.db.query(Telemetry).filter(Telemetry.uuid == command.payload.uuid).first()
        if db_obj is None:
            raise RuntimeError("telemetry upsert did not return a row")
        return db_obj

    def _upsert_orm(self, command: TelemetryIngestCommand) -> Telemetry:
        data = command.payload
        db_obj = self.db.query(Telemetry).filter(Telemetry.uuid == data.uuid).first()
        if db_obj:
            for key, value in command.db_update_payload().items():
                setattr(db_obj, key, value)
        else:
            db_obj = Telemetry(**command.db_insert_payload())
            self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def _is_postgres_session(self) -> bool:
        return self.db.get_bind().dialect.name == "postgresql"


default_read_model_store = TelemetryReadModelStore()


def upsert_telemetry(command_or_data: TelemetryIngestCommand | TelemetryCreate, db: Session) -> Telemetry:
    return TelemetryRepository(db).upsert(command_or_data)


def format_epoch_millis(epoch_val: int | None) -> str | None:
    if epoch_val is None:
        return None
    return format_epoch_seconds(epoch_val / 1000)


def format_epoch_seconds(epoch_val: object) -> str:
    try:
        if not isinstance(epoch_val, (int, float, str, bytes, bytearray)):
            return str(epoch_val)
        sec = int(epoch_val)
        h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
        return f"{h:02}:{m:02}:{s:02}"
    except Exception:
        return str(epoch_val)


def format_epoch(epoch_val: object) -> str:
    return format_epoch_seconds(epoch_val)


def _build_postgres_telemetry_upsert(payload: dict[str, object | None]) -> Insert:
    insert_statement = postgres_insert(Telemetry).values(**payload)
    update_columns = {
        column_name: getattr(insert_statement.excluded, column_name) for column_name in payload if column_name != "uuid"
    }
    return insert_statement.on_conflict_do_update(
        index_elements=["uuid"],
        set_=update_columns,
    )
