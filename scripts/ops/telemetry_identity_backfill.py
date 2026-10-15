#!/usr/bin/env python3
"""Bounded, resumable telemetry identity backfill with guarded primary-key finalization."""

from __future__ import annotations

import argparse
import json
from contextlib import closing

import psycopg2
from psycopg2.extensions import connection as PgConnection
from telemetry_backfill_safety import (
    CONNECT_TIMEOUT_SECONDS,
    BackfillErrorCode,
    BackfillOptions,
    IdentityBackfillError,
    database_dsn,
    require_mutation_authority,
)

BACKFILL_SQL = """
    WITH batch AS (
        SELECT ctid FROM telemetry_history WHERE event_id IS NULL
        LIMIT %s FOR UPDATE SKIP LOCKED
    )
    UPDATE telemetry_history h SET event_id = 'legacy:' || gen_random_uuid()::text
    FROM batch WHERE h.ctid = batch.ctid
"""
PENDING_SQL = "SELECT EXISTS (SELECT 1 FROM telemetry_history WHERE event_id IS NULL)"
EXPECTED_PRIMARY_KEY = "PRIMARY KEY (event_id)"


def primary_key_ready(connection: PgConnection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'telemetry_history'::regclass AND contype = 'p'"
        )
        constraint = cursor.fetchone()
    if constraint is None:
        return False
    if constraint[0] != EXPECTED_PRIMARY_KEY:
        raise IdentityBackfillError(BackfillErrorCode.UNEXPECTED_TELEMETRY_PRIMARY_KEY)
    return True


def pending_history_identifiers(connection: PgConnection) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(PENDING_SQL)
        row = cursor.fetchone()
    if row is None or len(row) != 1 or type(row[0]) is not bool:
        raise IdentityBackfillError(BackfillErrorCode.DATABASE_RESPONSE_INVALID)
    return bool(row[0])


def finalize_primary_key(connection: PgConnection) -> None:
    with connection:
        if primary_key_ready(connection):
            return
        if pending_history_identifiers(connection):
            raise IdentityBackfillError(BackfillErrorCode.BACKFILL_INCOMPLETE)
        with connection.cursor() as cursor:
            cursor.execute("ALTER TABLE telemetry_history VALIDATE CONSTRAINT ck_telemetry_history_event_id_present")
            cursor.execute("ALTER TABLE telemetry_history ALTER COLUMN event_id SET NOT NULL")
            cursor.execute(
                "ALTER TABLE telemetry_history ADD CONSTRAINT pk_telemetry_history PRIMARY KEY USING INDEX ux_telemetry_history_event_id"
            )


def backfill(connection: PgConnection, options: BackfillOptions) -> dict[str, object]:
    options.validate()
    updated = 0
    if options.run:
        for _ in range(options.max_batches):
            with connection, connection.cursor() as cursor:
                cursor.execute(BACKFILL_SQL, (options.batch_size,))
                accepted = cursor.rowcount
                if not 0 <= accepted <= options.batch_size:
                    raise IdentityBackfillError(BackfillErrorCode.DATABASE_RESPONSE_INVALID)
                updated += accepted
            if accepted == 0:
                break
    if options.finalize:
        finalize_primary_key(connection)
    with connection:
        pending = pending_history_identifiers(connection)
        ready = primary_key_ready(connection)
    return {
        "result": "PASS",
        "updated": updated,
        "pending": pending,
        "primaryKeyReady": ready,
        "complete": not pending and ready,
        "finalization": "PASS" if options.finalize else "NOT_RUN",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--run", action="store_true")
    mode.add_argument("--check", dest="run", action="store_false")
    parser.set_defaults(run=False)
    parser.add_argument("--finalize", action="store_true")
    parser.add_argument("--local-fixture", action="store_true")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--max-batches", type=int, default=10)
    arguments = parser.parse_args()
    try:
        options = BackfillOptions(**vars(arguments))
        options.validate()
        require_mutation_authority(options)
        with closing(
            psycopg2.connect(
                database_dsn(options),
                connect_timeout=CONNECT_TIMEOUT_SECONDS,
                options="-c statement_timeout=10000 -c lock_timeout=2000 -c timezone=UTC",
            )
        ) as connection:
            report = backfill(connection, options)
        print(json.dumps(report, sort_keys=True))
        return 0 if not options.run or report["complete"] else 3
    except IdentityBackfillError as error:
        print(json.dumps({"result": "FAIL", "errorCode": str(error)}))
        return 1
    except (OSError, ValueError, KeyError, TypeError, psycopg2.Error):
        print(json.dumps({"result": "FAIL", "errorCode": "telemetry_identity_migration_failed"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
