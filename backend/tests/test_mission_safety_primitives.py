import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "contracts/mission/v1/mission-dispatch.schema.json"
MISSION = ROOT / "services/media-control/internal/mission/mission.go"
LEDGER = ROOT / "services/media-control/internal/mission/redis_command_ledger.go"


def test_mission_contract_requires_bounded_geofence_version() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))

    assert "geofenceVersion" in schema["required"]
    assert schema["properties"]["geofenceVersion"] == {"type": "string", "minLength": 1, "maxLength": 128}


def test_mission_domain_bounds_lifetime_and_rejects_stale_geofence() -> None:
    source = MISSION.read_text(encoding="utf-8")

    assert "MaxCommandLifetime = 5 * time.Minute" in source
    assert "ErrGeofenceVersionStale" in source
    assert "request.GeofenceVersion" in source


def test_command_ledger_uses_hashed_versioned_expiry_bound_reservation() -> None:
    source = LEDGER.read_text(encoding="utf-8")

    assert 'commandLedgerKeyPrefix = "gcs:mission-command:v1:"' in source
    assert "sha256.Sum256" in source
    assert '.SetNX(ctx, commandLedgerKey(commandID), "reserved", ttl)' in source
    assert "ErrCommandLedgerUnavailable" in source
