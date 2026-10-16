# GCS-Saker Geo Schema Migration Runbook

## 적용 전 조건

- 대상은 Server-01 production의 canonical `gcs-saker-m2-production` PostgreSQL뿐이다.
- 현재 source commit의 CI 필수5개가 모두 통과해야 한다.
- 24시간 이내의 custom-format DB dump가 별도 DB에 복원됐고, table count가 일치하는 backup evidence가 필요하다.
- 승인된 유지보수 창과 disk preflight 여유가 필요하다. active stream 중단을 요구하지 않지만 CPU/I/O 증가를 감시한다.
- Server-02/55122를 조회·대체·fallback으로 사용하지 않는다.
- 동일 source의 qualification은50만 행 concurrent build를 독립3회 실행해 매회 read/write p95<500ms, progress 관측, V38 temp write0을 충족해야 한다.

## 사전 확인

1. `pg_stat_activity`에서 장기 transaction과 오래된 snapshot을 확인한다.
2. `pg_stat_progress_create_index`에 동일 table의 concurrent build가 없는지 확인한다.
3. 동일 이름 index의 `indisvalid`, `indisready`, `pg_get_indexdef`를 확인한다.
4. `GCS_DB_BACKUP_EVIDENCE`, `GCS_MAINTENANCE_WINDOW_APPROVED=1`, canonical Compose/environment 경로를 준비한다.
5. runner가 출력하는 disk preflight 실패를 우회하지 않는다. `maintenance_work_mem`을 즉석에서 올리지 않는다.

## 실행

`scripts/ops/apply_geo_migrations.sh`만 사용한다. migration SQL을 직접 복사해 실행하거나 init SQL만 따로 수정하지 않는다. runner는 checksum과 advisory lock을 확인하고 concurrent index를 만든 뒤 validity를 검증하고 version history를 기록한다.

성공 후 아래를 확인한다.

- `gcs_geo.schema_migrations`의 version/checksum이 현재 파일과 일치한다.
- `idx_stream_telemetry_points_observed_at_id`가 valid/ready이며 `(observed_at, id)` 정의다.
- telemetry ingest/read가 정상이고 rejection/latency/queue-depth가 기준을 벗어나지 않는다.
- V38 batch 계획이 해당 index를 사용하며 Sort/temp write가0이다.

## 실패 복구

runner는 invalid 또는 다른 정의의 동일 이름 index를 자동 삭제하지 않는다. 실패한 concurrent build는 PostgreSQL catalog에 invalid index를 남겨 쓰기 비용을 유발할 수 있으므로 다음 순서를 따른다.

1. runner 출력을 보존하고 migration history가 기록되지 않았는지 확인한다.
2. `pg_index`와 `pg_get_indexdef`로 이름·table·validity·readiness를 확인한다.
3. valid하고 정의가 정확하면 runner를 재실행해 history만 복구한다.
4. invalid/not-ready이거나 정의가 다르면 active concurrent build가 없고 backup/maintenance 승인이 유효한지 다시 확인한다.
5. 정확히 `gcs_geo.idx_stream_telemetry_points_observed_at_id`만 대상으로 `DROP INDEX CONCURRENTLY`를 운영자가 실행한다. 변수·glob·검색 결과를 삭제 명령에 전달하지 않는다.
6. runner를 재실행하고 성공 후 ingest/read 및 V38 계획을 재검증한다.

table 자체, 기존 group/stream/GiST index 또는 migration history를 삭제하지 않는다. 실패를 숨기기 위해 checksum을 수정하거나 history row를 수동 삽입하지 않는다.

## 롤백 경계

이 index는 성능 보조 구조이며 canonical data가 아니다. application rollback은 index를 자동 제거하지 않는다. 운영 회귀가 확인돼 제거가 필요하면 별도의 승인된 stateful maintenance로 동일한 정확한 index만 concurrent drop하고, V38 caller가 아직 해당 index에 의존하지 않는지 먼저 확인한다.
