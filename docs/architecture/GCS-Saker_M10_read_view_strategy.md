# GCS-Saker M10 Read View Strategy

## 목적

운영 대시보드가 커질수록 화면별 API가 `event`, `stream`, `server health`, `telemetry`, `asset`, `group` 데이터를 계속 조합하게 된다. 이 조합을 controller나 frontend에서 반복하면 쿼리 수와 렌더링 조립 비용이 함께 늘어난다.

이 문서는 DB View를 전면 도입하지 않고, read model 전용 경계에 제한적으로 도입하는 기준을 고정한다.

## 도입 원칙

- 인증, refresh token, publish token, WebRTC signaling, media frame 경로에는 DB View를 두지 않는다.
- write path는 table과 repository가 명확히 소유한다.
- View는 dashboard read path의 반복 조합, 최신 상태 projection, 통계 projection에만 사용한다.
- 실시간성이 강한 상태는 Redis 또는 event read model을 우선하고, DB View는 느슨한 조회/운영 분석에 둔다.
- PostgreSQL/PostGIS 전환 이후 공간/거리/영역 조회는 PostGIS index와 view를 함께 검토한다.

## 후보와 제외

| 영역 | 결정 | 이유 |
| --- | --- | --- |
| Dashboard 운영 요약 | 후보 | stream, event, health를 조합하는 read model이 커지면 view 또는 GraphQL BFF 후보가 된다. |
| Event log 검색/필터/집계 | 후보 | severity, category, ICE path, stream별 집계는 일반 view보다 aggregate query 또는 materialized view 후보다. |
| Server health + stream status 결합 | 후보 | 운영 화면에서 함께 조회되며 최신 상태 projection 비용을 줄일 수 있다. |
| Telemetry 최신값 | 제외 | 이미 `telemetry_latest` read model table이 있다. 고빈도 upsert 경로를 view로 감싸지 않는다. |
| Telemetry history range | 제외 | `uuid + recorded_at` index와 cursor/range query가 우선이다. 대량 분석은 partition 또는 TimescaleDB 후보로 분리한다. |
| Group 기반 asset list | 후보 | closure table과 asset list join이 반복되면 일반 view 후보다. |
| PostGIS 위치/거리/영역 조회 | 후보 | `position && ST_MakeEnvelope`와 GiST index를 사용하는 bounded map query는 PostGIS read view 후보다. |
| WebRTC signaling/media | 제외 | 초저지연 경로이며 DB read view가 media plane에 들어오면 안 된다. |
| Refresh token/session write | 제외 | 인증 write path는 Redis/session store의 atomic operation이 우선이다. |

## 첫 도입 대상

`operational_stream_session_latest`를 첫 DB View로 둔다.

### 이유

`stream_sessions`는 append-only 이력 테이블이다. UI는 대부분 특정 stream/session의 최신 상태만 필요로 한다. 기존 repository query는 매 조회마다 `NOT EXISTS` anti join으로 최신 row를 찾았다. 이 로직을 view로 분리하면 repository는 권한 필터와 정렬만 담당하고, 최신 상태 projection은 DB read model이 담당한다.

### SQL

```sql
DROP VIEW IF EXISTS operational_stream_session_latest;

CREATE VIEW operational_stream_session_latest AS
SELECT
    stream_id,
    session_id,
    status,
    source,
    started_at,
    last_heartbeat_at,
    stopped_at,
    group_id
FROM (
    SELECT
        stream_id,
        session_id,
        status,
        source,
        started_at,
        last_heartbeat_at,
        stopped_at,
        group_id,
        ROW_NUMBER() OVER (
            PARTITION BY group_id, stream_id, COALESCE(session_id, '')
            ORDER BY last_heartbeat_at DESC, id DESC
        ) AS session_rank
    FROM stream_sessions
) ranked_stream_sessions
WHERE session_rank = 1;
```

### Repository query

```sql
SELECT stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
FROM operational_stream_session_latest
WHERE (group_id = ? OR ? = ?)
ORDER BY last_heartbeat_at DESC, stream_id;
```

## 일반 View와 Materialized View

| 방식 | 사용 위치 | 장점 | 위험 | refresh/consistency |
| --- | --- | --- | --- | --- |
| 일반 View | 최신 stream session, group asset projection | 항상 원본 table 기준으로 최신 | query 비용은 원본 table scan/index 사용에 의존 | refresh 없음, transaction consistency는 원본 table과 동일 |
| Materialized View | 이벤트 집계, 장기 운영 통계 | 반복 aggregation 비용 절감 | refresh 전까지 stale data | 운영 통계는 5초~1분 주기 또는 batch 후 refresh |
| Application Read Model | telemetry latest, stream cache | write 시점에 정확한 shape로 저장 | write path가 복잡해질 수 있음 | write transaction 또는 event handler에서 갱신 |
| Redis Cache | ICE server list, refresh session, stream presence | 초저지연, TTL, 장애 시 fallback 가능 | durable source가 아님 | TTL 기반, miss/error 시 DB/API fallback |

## 실시간 데이터 분리

- Stream presence: Redis TTL과 media-control registry가 우선이다.
- Telemetry latest: `telemetry_latest` 또는 PostGIS `stream_telemetry_latest` table이 우선이다.
- Event log: append-only table에 저장하고, 검색/집계가 무거워질 때 materialized view 또는 OpenSearch 후보로 분리한다.
- Server health: 최신 표시에는 cache를 사용할 수 있지만, 운영 분석은 `server_health_snapshots` history table을 사용한다.

## Contract Test 계획

- Flyway migration test: `V4__operational_read_views.sql` 적용 여부 확인.
- Repository test: `streamSessionsFor`가 최신 row만 반환하는지 확인.
- SQL contract test: repository query가 `operational_stream_session_latest` view를 사용하고 inline anti join을 반복하지 않는지 확인.
- Architecture test: 이 문서가 후보/제외/refresh/Redis 분리 기준을 유지하는지 확인.

## 다음 후보

1. `operational_event_hourly_metrics_mv`
   - source: `operational_events`
   - key: `group_id`, hour bucket, severity, ice path
   - 목적: 이벤트 로그 페이지의 통계 그래프와 서버 네트워크 추세
   - refresh: 운영 dashboard에서는 10~60초 주기, 분석 batch에서는 batch 완료 후 refresh

2. `group_visible_assets_v`
   - source: `organization_group_closure`, `gateway_assets`, `registered_devices`
   - 목적: 상위 group 사용자가 하위 group asset을 볼 때 반복 join 축소
   - refresh: 일반 view 우선. group hierarchy 변경이 드물기 때문에 materialized view도 후보

3. `postgis_stream_latest_bounds_v`
   - source: `gcs_geo.stream_telemetry_latest`
   - 목적: 지도 viewport 내 최신 stream 위치 조회
   - refresh: 일반 view 또는 direct indexed query. materialized view는 제외
