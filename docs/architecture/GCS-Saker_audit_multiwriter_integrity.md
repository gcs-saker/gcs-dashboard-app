# Audit append serialization

PostgreSQL owns the singleton `operational_audit_chain_head` row. Each append transaction locks that row, checks event identity, inserts the event, and advances hash/count atomically. PostgreSQL inserts use `ON CONFLICT (id) DO NOTHING`; duplicate IDs never advance the chain. The writer does not depend on a JVM monitor. Its transaction contains only database work and pure hashing.

The chain follows append order, including events whose client occurrence timestamp is older than the current tail. Head readers fetch hash/count in a single query. Historical events remain append-only under V27. V33 refuses pre-existing forks and adds a partial unique index on the previous hash; it does not rewrite historical audit evidence.

Before hashing, the writer normalizes severity to the stored lowercase form and timestamps to their database precision (occurrence time: milliseconds; clock/receive evidence: microseconds). Otherwise a valid hash of a nanosecond input could no longer verify after the database rounds that input. Existing historical hashes are not recomputed; pre-existing unverifiable records remain review evidence under #664.

Lock timeout is 500 ms, statement timeout is 2 s, and each transaction timeout is 3 s. Only translated lock/deadlock failures retry, with three attempts and 50/100 ms backoff. Interrupts are preserved. Exhaustion returns `AuditAppendError(audit_lock_timeout)`; other storage failures return a stable typed error. Logs never include event IDs, SQL or raw causes. Append result counters use only appended/duplicate/failed labels, with a duration timer on the same boundary.

Non-audit operational events currently share the short singleton transaction, so cross-process event-id deduplication also works for those writes. Measure contention under #920 before splitting this path; an optimization must preserve audit ordering and transactional idempotency.

Production transition requires a verified backup and quiescing all old writers before migration, followed by immutable deployment of every writer. A pre-existing fork is a review blocker, not a repair opportunity to erase history. Rollback cannot re-enable old writers against a head advanced by the new implementation without a reviewed compatibility procedure. No production migration is performed by local tests.

Tests create independent writer instances against real PostgreSQL, concurrently append and replay events with reversed timestamps, verify one connected chain and atomic head count, and hold the head lock until bounded retries fail. A subsequent append after releasing the lock must succeed. Memory/H2 and cryptographic hash/anchor regressions remain in the normal suite.

Local Docker validation on 2026-10-14: full Auth Policy `gradle check` passed (417 tests, zero failures/errors/skips), including PostgreSQL multi-writer, lock timeout/recovery, invalid-insert rollback, persisted hash verification, and repeated startup rejection of a pre-existing fork. JaCoCo covered 6,700 of 7,566 lines (88.55%, above the 85% gate). SQLSTATE classifier tests cover lock/deadlock/serialization retry and denial of integrity/connection/generic timeout retries. Physical devices and production migration are NOT_RUN for this database change.
