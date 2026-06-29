# GCS-Saker M8 PostgreSQL/PostGIS Bounded Context

## 목적

PostgreSQL/PostGIS는 Supabase 없이 폐쇄망에서도 운용 가능한 primary durable store다. M12 전환에서는 MySQL runtime 의존을 제거하고, 사용자/인증/운영 이벤트와 stream telemetry 좌표 read model을 같은 PostgreSQL/PostGIS 계열에서 관리한다.

## 데이터 분리 기준

- PostgreSQL/PostGIS primary store: 사용자, 인증, 운영 이벤트, stream telemetry 최신값과 위치 이력
- Redis 또는 Dragonfly: refresh session, principal cache, ICE list, stream presence
- PostgreSQL/PostGIS spatial context: GPS point history, latest stream point, bounding box query

media frame은 DB에 저장하지 않는다. 영상 녹화가 필요하면 object storage 또는 파일 저장소를 별도 이슈로 분리한다.

## 테이블 구조

`gcs_geo.stream_telemetry_points`

- 모든 telemetry point history를 append 중심으로 저장한다.
- `org_id`, `group_id`, `asset_id`, `stream_id`로 권한과 조직 범위를 좁힌다.
- `event_id` unique contract로 중복 ingest를 막는다.
- `position geometry(Point, 4326)`에 GiST index를 붙인다.

`gcs_geo.stream_telemetry_latest`

- dashboard map focus와 geometry/telemetry panel이 읽는 최신값 table이다.
- primary key는 `(org_id, group_id, stream_id)`다.
- history table을 매번 정렬하지 않고 최신 위치를 바로 읽기 위한 read model이다.

## 쿼리 튜닝 기준

### 선택 stream 최신 위치

```sql
EXPLAIN (ANALYZE, BUFFERS, WAL)
SELECT stream_id, asset_id, observed_at, ST_X(position) AS longitude, ST_Y(position) AS latitude
FROM gcs_geo.stream_telemetry_latest
WHERE org_id = $1 AND group_id = $2 AND stream_id = $3;
```

기대 실행 흐름:

1. primary key 조건으로 latest table에서 row 1건을 찾는다.
2. history table 정렬을 수행하지 않는다.
3. 디스크 I/O는 latest table/index hit 중심으로 제한된다.

### 지도 viewport bounding box

```sql
EXPLAIN (ANALYZE, BUFFERS, WAL)
SELECT stream_id, asset_id, observed_at, ST_X(position) AS longitude, ST_Y(position) AS latitude
FROM gcs_geo.stream_telemetry_latest
WHERE org_id = $1
  AND group_id = $2
  AND position && ST_MakeEnvelope($3, $4, $5, $6, 4326)
ORDER BY observed_at DESC
LIMIT $7;
```

기대 실행 흐름:

1. `org_id`, `group_id`로 조직 범위를 줄인다.
2. GiST spatial index로 viewport 안 후보 row만 찾는다.
3. application이 전체 좌표를 가져와 직접 거리/포함 계산하지 않는다.

## 왜 latest table을 따로 두나

history table만 쓰면 최신 위치 조회가 아래 비용을 만든다.

- stream별 `ORDER BY observed_at DESC`
- 최근 row를 찾기 위한 index range scan
- point가 늘어날수록 buffer hit와 sort 비용 증가

latest table을 두면 ingest 시 upsert 비용은 조금 생기지만, dashboard read path는 primary key lookup으로 고정된다. 실시간 화면은 쓰기보다 읽기 빈도가 높은 순간이 많으므로 대시보드 체감 속도에 유리하다.

latest table에는 stream lookup primary key와 viewport용 GiST index만 둔다. 불필요한 보조 index를 늘리면 write amplification이 커지고, 작은 데이터셋에서 planner가 selected stream 조회에 애매한 index를 고를 수 있다.

## 운영 전 확인

- 기본 single-node 배포는 PostgreSQL/PostGIS + Redis를 사용한다.
- 기존 MySQL 운영 데이터 이전은 별도 migration runbook에서 백업, 변환, 검증 순서로 수행한다.
- PostGIS image와 extension version은 release마다 기록한다.
- 대량 ingest 전에는 `EXPLAIN (ANALYZE, BUFFERS, WAL)` 결과, index hit ratio, WAL records/bytes, lock wait 징후를 보관한다.
