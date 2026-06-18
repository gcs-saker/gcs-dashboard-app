from __future__ import annotations

from sqlalchemy.orm import Session

from api.telemetry import upsert_telemetry
from core.db import SessionLocal
from model.telemetry_model import TelemetryCreate


class DbTelemetrySink:
    def upsert(self, telemetry: TelemetryCreate) -> object:
        with new_session() as db:
            return upsert_telemetry(telemetry, db)


def new_session() -> Session:
    return SessionLocal()
