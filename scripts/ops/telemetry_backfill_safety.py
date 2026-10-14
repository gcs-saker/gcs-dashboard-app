"""Input, secret-file and backup authority boundary for telemetry identity maintenance."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

CONNECT_TIMEOUT_SECONDS = 3
BACKUP_MAX_AGE = timedelta(hours=24)
BACKUP_HASH_CHUNK_BYTES = 1024 * 1024
LOCAL_DATABASES = frozenset({"gcs_identity_backfill_smoke", "gcs_ownership_smoke"})
LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost", "postgres"})


class BackfillErrorCode(Enum):
    POSIX_FILE_BOUNDARY_REQUIRED = "posix_file_boundary_required"
    SERVER01_TARGET_REQUIRED = "server01_target_required"
    DATABASE_RESPONSE_INVALID = "database_response_invalid"
    BACKFILL_BOUNDS_INVALID = "backfill_bounds_invalid"
    FINALIZE_REQUIRES_RUN = "finalize_requires_run"
    PRIVATE_FILE_INVALID = "private_file_invalid"
    PRIVATE_FILE_PERMISSIONS_INVALID = "private_file_permissions_invalid"
    DATABASE_SECRET_SIZE_INVALID = "database_secret_size_invalid"
    DATABASE_TARGET_INVALID = "database_target_invalid"
    LOCAL_FIXTURE_TARGET_INVALID = "local_fixture_target_invalid"
    DATABASE_TLS_REQUIRED = "database_tls_required"
    BACKUP_EVIDENCE_INVALID = "backup_evidence_invalid"
    BACKUP_CHECKSUM_MISMATCH = "backup_checksum_mismatch"
    BACKUP_RESTORE_UNVERIFIED = "backup_restore_unverified"
    BACKUP_EVIDENCE_EXPIRED = "backup_evidence_expired"
    MAINTENANCE_WINDOW_REQUIRED = "maintenance_window_required"
    UNEXPECTED_TELEMETRY_PRIMARY_KEY = "unexpected_telemetry_primary_key"
    BACKFILL_INCOMPLETE = "backfill_incomplete"


class IdentityBackfillError(RuntimeError):
    def __init__(self, code: BackfillErrorCode) -> None:
        super().__init__(code.value)


@dataclass(frozen=True)
class BackfillOptions:
    run: bool
    finalize: bool
    local_fixture: bool
    batch_size: int
    max_batches: int

    def validate(self) -> None:
        if type(self.batch_size) is not int or type(self.max_batches) is not int:
            raise IdentityBackfillError(BackfillErrorCode.BACKFILL_BOUNDS_INVALID)
        if not 1 <= self.batch_size <= 10_000 or not 1 <= self.max_batches <= 1000:
            raise IdentityBackfillError(BackfillErrorCode.BACKFILL_BOUNDS_INVALID)
        if self.finalize and not self.run:
            raise IdentityBackfillError(BackfillErrorCode.FINALIZE_REQUIRES_RUN)


def private_file(path: Path, runtime_acl: bool = False) -> Path:
    if os.name != "posix":
        raise IdentityBackfillError(BackfillErrorCode.POSIX_FILE_BOUNDARY_REQUIRED)
    if not path.is_absolute() or path.is_symlink() or not path.is_file():
        raise IdentityBackfillError(BackfillErrorCode.PRIVATE_FILE_INVALID)
    metadata = path.stat()
    permissions = stat.S_IMODE(metadata.st_mode)
    allowed_group = runtime_acl and metadata.st_gid == 10050 and metadata.st_gid in os.getgroups()
    if metadata.st_uid not in {0, os.geteuid()} or permissions & 0o037:
        raise IdentityBackfillError(BackfillErrorCode.PRIVATE_FILE_PERMISSIONS_INVALID)
    if permissions & 0o070 and not allowed_group:
        raise IdentityBackfillError(BackfillErrorCode.PRIVATE_FILE_PERMISSIONS_INVALID)
    return path


def database_dsn(options: BackfillOptions) -> str:
    if options.local_fixture:
        dsn = os.environ.get("TEST_TELEMETRY_POSTGRES_DSN", "")
    else:
        if os.environ.get("DEPLOYMENT_TARGET") != "server01-production":
            raise IdentityBackfillError(BackfillErrorCode.SERVER01_TARGET_REQUIRED)
        secret = private_file(Path(os.getenv("DATABASE_URL_FILE", "/run/secrets/DATABASE_URL")), True)
        if secret.stat().st_size > 4096:
            raise IdentityBackfillError(BackfillErrorCode.DATABASE_SECRET_SIZE_INVALID)
        dsn = secret.read_text(encoding="utf-8").strip()
    dsn = dsn.replace("postgresql+psycopg2://", "postgresql://", 1)
    parsed = urlsplit(dsn)
    if parsed.scheme != "postgresql" or not parsed.hostname:
        raise IdentityBackfillError(BackfillErrorCode.DATABASE_TARGET_INVALID)
    if options.local_fixture:
        if parsed.hostname not in LOCAL_HOSTS or parsed.path.lstrip("/") not in LOCAL_DATABASES:
            raise IdentityBackfillError(BackfillErrorCode.LOCAL_FIXTURE_TARGET_INVALID)
    else:
        query = parse_qs(parsed.query)
        if query.get("sslmode") != ["verify-full"] or not query.get("sslrootcert"):
            raise IdentityBackfillError(BackfillErrorCode.DATABASE_TLS_REQUIRED)
    return dsn


def verify_backup(path: Path, now: datetime) -> None:
    evidence = private_file(path)
    if evidence.stat().st_size > 16_384:
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_EVIDENCE_INVALID)
    expected = validate_backup_manifest(json.loads(evidence.read_text(encoding="utf-8")), now)
    digest = hashlib.sha256()
    with private_file(evidence.parent / "database.dump").open("rb") as archive:
        for chunk in iter(lambda: archive.read(BACKUP_HASH_CHUNK_BYTES), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_CHECKSUM_MISMATCH)


def validate_backup_manifest(manifest: object, now: datetime) -> str:
    if (
        not isinstance(manifest, dict)
        or type(manifest.get("schemaVersion")) is not int
        or manifest["schemaVersion"] != 1
    ):
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_EVIDENCE_INVALID)
    required_flags = ("restoreVerified", "previousImagesCaptured", "composeAndEnvironmentCaptured")
    if not all(manifest.get(key) is True for key in required_flags):
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_RESTORE_UNVERIFIED)
    count = manifest.get("sourceTableCount")
    if (
        type(count) is not int
        or count <= 0
        or type(manifest.get("restoredTableCount")) is not int
        or count != manifest["restoredTableCount"]
    ):
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_RESTORE_UNVERIFIED)
    completed = manifest.get("completedAt")
    source_commit = manifest.get("sourceCommit")
    expected = manifest.get("databaseDumpSha256")
    if not isinstance(completed, str) or not isinstance(source_commit, str) or not isinstance(expected, str):
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_EVIDENCE_INVALID)
    if re.fullmatch("[a-f0-9]{40}", source_commit) is None or re.fullmatch("[a-f0-9]{64}", expected) is None:
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_EVIDENCE_INVALID)
    verified_at = datetime.strptime(completed, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    if not -timedelta(minutes=1) <= now - verified_at <= BACKUP_MAX_AGE:
        raise IdentityBackfillError(BackfillErrorCode.BACKUP_EVIDENCE_EXPIRED)
    return expected


def require_mutation_authority(options: BackfillOptions) -> None:
    if not options.run or options.local_fixture:
        return
    if os.environ.get("DEPLOYMENT_TARGET") != "server01-production":
        raise IdentityBackfillError(BackfillErrorCode.SERVER01_TARGET_REQUIRED)
    if os.environ.get("GCS_MAINTENANCE_WINDOW_APPROVED") != "1":
        raise IdentityBackfillError(BackfillErrorCode.MAINTENANCE_WINDOW_REQUIRED)
    verify_backup(Path(os.environ.get("GCS_DB_BACKUP_EVIDENCE", "")), datetime.now(timezone.utc))
