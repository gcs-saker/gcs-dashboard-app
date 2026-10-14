import hashlib
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/ops/telemetry_identity_backfill.py"
NOW = datetime(2026, 10, 14, 0, 0, tzinfo=timezone.utc)


def load_backfill():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    spec = importlib.util.spec_from_file_location("identity_backfill", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_safety():
    if str(SCRIPT.parent) not in sys.path:
        sys.path.insert(0, str(SCRIPT.parent))
    return importlib.import_module("telemetry_backfill_safety")


def valid_manifest():
    return {
        "schemaVersion": 1,
        "completedAt": "20261014T000000Z",
        "sourceCommit": "a" * 40,
        "databaseDumpSha256": hashlib.sha256(b"test archive").hexdigest(),
        "sourceTableCount": 5,
        "restoredTableCount": 5,
        "restoreVerified": True,
        "previousImagesCaptured": True,
        "composeAndEnvironmentCaptured": True,
    }


@pytest.mark.parametrize("batch_size,max_batches", [(0, 1), (10_001, 1), (1, 0), (1, 1001)])
def test_backfill_rejects_unbounded_or_empty_work(batch_size, max_batches):
    module = load_safety()
    with pytest.raises(module.IdentityBackfillError, match="bounds_invalid"):
        module.BackfillOptions(True, False, True, batch_size, max_batches).validate()


@pytest.mark.parametrize("batch_size,max_batches", [(1, 1), (10_000, 1000)])
def test_backfill_accepts_exact_work_boundaries(batch_size, max_batches):
    module = load_safety()
    module.BackfillOptions(True, False, True, batch_size, max_batches).validate()


@pytest.mark.parametrize(
    "dsn",
    [
        "postgresql://postgres@server01/gcs_identity_backfill_smoke",
        "postgresql://postgres@localhost/production",
        "mysql://localhost/gcs_ownership_smoke",
    ],
)
def test_fixture_guard_cannot_select_an_external_or_production_database(monkeypatch, dsn):
    module = load_safety()
    monkeypatch.setenv("TEST_TELEMETRY_POSTGRES_DSN", dsn)
    with pytest.raises(module.IdentityBackfillError):
        module.database_dsn(module.BackfillOptions(True, False, True, 1, 1))


@pytest.mark.parametrize(
    "field,value",
    [
        ("schemaVersion", True),
        ("restoreVerified", False),
        ("restoredTableCount", 6),
        ("sourceTableCount", None),
        ("sourceCommit", "invalid"),
        ("completedAt", "20261012T000000Z"),
    ],
)
def test_backup_proof_requires_restore_counts_revision_and_recent_timestamp(field, value):
    module = load_safety()
    manifest = valid_manifest()
    manifest[field] = value
    with pytest.raises(module.IdentityBackfillError):
        module.validate_backup_manifest(manifest, NOW)


@pytest.mark.skipif(os.name != "posix", reason="Linux operations file ACL boundary")
def test_backup_verification_checks_owner_only_archive_and_checksum(tmp_path):
    module = load_safety()
    manifest = valid_manifest()
    proof = tmp_path / "drill-result.json"
    archive = tmp_path / "database.dump"
    proof.write_text(json.dumps(manifest), encoding="utf-8")
    archive.write_bytes(b"test archive")
    proof.chmod(0o600)
    archive.chmod(0o600)
    module.verify_backup(proof, NOW)
    archive.write_bytes(b"tampered archive")
    with pytest.raises(module.IdentityBackfillError, match="checksum_mismatch"):
        module.verify_backup(proof, NOW)
    proof.chmod(0o644)
    with pytest.raises(module.IdentityBackfillError, match="permissions_invalid"):
        module.verify_backup(proof, NOW)


def test_production_writes_require_explicit_server01_maintenance_authority(monkeypatch):
    module = load_safety()
    monkeypatch.delenv("DEPLOYMENT_TARGET", raising=False)
    options = module.BackfillOptions(True, True, False, 1000, 10)
    with pytest.raises(module.IdentityBackfillError, match="server01_target_required"):
        module.require_mutation_authority(options)
    monkeypatch.setenv("DEPLOYMENT_TARGET", "server01-production")
    monkeypatch.delenv("GCS_MAINTENANCE_WINDOW_APPROVED", raising=False)
    with pytest.raises(module.IdentityBackfillError, match="maintenance_window_required"):
        module.require_mutation_authority(options)
