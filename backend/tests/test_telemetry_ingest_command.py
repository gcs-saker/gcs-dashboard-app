from model.telemetry_model import TelemetryCreate
from modules.telemetry_ingest import TelemetryIngestCommand, TelemetryReadModelStore, format_epoch_millis


def test_telemetry_ingest_command_separates_db_payload_from_read_model_snapshot() -> None:
    payload = TelemetryCreate(
        uuid="raw.mobile.front",
        latitude=35.871435,
        longitude=128.601445,
        epochTime=12_345,
    )

    command = TelemetryIngestCommand.from_create(payload)

    assert command.db_insert_payload()["epochTime"] == 12_345
    assert command.response_snapshot().epochTime == "00:00:12"


def test_format_epoch_millis_keeps_missing_time_nullable() -> None:
    assert format_epoch_millis(None) is None


def test_telemetry_read_model_store_keeps_response_snapshots() -> None:
    store = TelemetryReadModelStore()
    command = TelemetryIngestCommand.from_create(TelemetryCreate(uuid="raw.mobile.front", epochTime=1_000))

    snapshot = store.upsert(command)

    assert snapshot.epochTime == "00:00:01"
    assert store.list() == [snapshot]
