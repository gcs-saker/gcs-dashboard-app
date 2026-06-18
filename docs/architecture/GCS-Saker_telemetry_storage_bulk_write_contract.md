# GCS-Saker Telemetry Storage Bulk Write Contract

Release track: v0.8.0-candidate

## 목적

Telemetry/GPS 데이터는 스트리밍 시스템에서 TURN 다음으로 병목이 커지기 쉬운 영역이다. 장비가 늘어나면 좌표, 배터리, 속도, 상태 이벤트가 짧은 주기로 들어오며, 이를 매번 DB에 `SELECT -> INSERT/UPDATE -> COMMIT` 순서로 넣으면 디스크 I/O, lock, SQL parse 비용이 커진다.

이번 계약은 다음 원칙을 고정한다.

- 최신 상태 조회는 write buffer 또는 Dragonfly/Redis latest cache를 우선 사용한다.
- 영구 저장이 필요한 history는 buffer에 모았다가 bulk로 flush한다.
- legacy MySQL/MariaDB latest table도 flush 시 row별 upsert를 반복하지 않고 bulk upsert statement를 사용한다.
- PostgreSQL/PostGIS 전환 시 latest table, append-only history table, materialized read model을 분리한다.

## 기존 문제

이전 flush 경로는 겉으로는 batch를 drain했지만 내부에서는 record마다 `upsert_telemetry()`를 호출했다.

```text
N개 telemetry 수신
-> buffer drain N개
-> upsert_telemetry() N회
-> DB statement N회 이상
-> commit N회 또는 dialect별 read-back query
```

이 방식은 데이터가 많아질수록 아래 비용이 같이 증가한다.

- SQL parse/execute round trip 증가
- row lock 횟수 증가
- commit 또는 transaction 관리 비용 증가
- latest state만 필요한 화면에서도 DB write path가 밀릴 가능성 증가

## 개선 후 실행 순서

```text
N개 telemetry 수신
-> TelemetryBulkBatch 생성
-> latest row dict N개 생성
-> dialect별 bulk upsert statement 1회
-> commit 1회
```

MySQL/MariaDB:

```sql
INSERT INTO telemetry_realtime (...)
VALUES (...), (...), (...)
ON DUPLICATE KEY UPDATE ...
```

PostgreSQL:

```sql
INSERT INTO telemetry_realtime (...)
VALUES (...), (...), (...)
ON CONFLICT (uuid) DO UPDATE SET ...
```

History append 후보:

```sql
INSERT INTO telemetry_history (...)
VALUES (...), (...), (...)
```

## 연산 감소 효과

예를 들어 1초 동안 100개 장비에서 telemetry 10개씩 들어오면 1,000개 record가 생긴다.

기존:

- upsert 함수 호출 1,000회
- DB execute 1,000회 이상
- 최신값 read-back 또는 ORM refresh 비용 발생 가능

개선:

- batch object 생성 1회
- DB execute 1회
- commit 1회

즉, DB 네트워크 round trip과 SQL parse 횟수는 record 수에 비례하던 구조에서 batch 수에 비례하는 구조로 바뀐다.

## PostgreSQL/PostGIS 확장 전략

### latest table

현재 dashboard, AI sidecar, media-control이 즉시 보는 최신 상태다. 조회는 uuid 중심이고, 계속 덮어쓴다.

### history table

과거 경로, 사고 분석, replay, 통계용 append-only table이다. geometry query를 위해 PostGIS point 또는 generated geometry column을 추가할 수 있다.

### materialized view

복잡한 join/read projection은 일반 view가 아니라 materialized view 후보로 둔다. 일반 view는 조회 때마다 원본 join을 다시 실행하므로 연산 감소 효과가 작다.

권장 후보:

- group별 장비 최신 위치
- 기간별 stream health summary
- 장비별 최근 N분 event/telemetry rollup

### retention

서버 저장소 한계를 고려해 data lifecycle을 분리한다.

- hot: 최근 telemetry 원본, 빠른 조회 대상
- warm: 압축/rollup 된 최근 이력
- cold: Parquet/object storage 또는 offline archive 후보

## 구현 위치

- Python value object: `backend/modules/telemetry_buffer/bulk_sql.py`
- flush adapter: `backend/modules/telemetry_buffer/sink.py`
- contract test: `backend/tests/test_telemetry_write_buffer.py`

## 다음 개선 후보

- Dragonfly queue-backed write buffer 구현
- PostgreSQL COPY protocol 또는 psycopg3 copy path 검증
- PostGIS spatial index 실행 계획 테스트
- materialized view refresh 전략 테스트
- telemetry status code를 문자열 대신 smallint/enum으로 경량화
- TimescaleDB 또는 native partitioning 검토
