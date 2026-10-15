# GCS-Saker DB Query Tuning Guide v0.1

이 문서는 legacy Python/MySQL 경로와 M7 전환 경로에서 DB query 성능을 올리기 위한 실행 순서, 필요한 인덱스, 기대되는 연산 감소를 정리한다. 목표는 단순히 query round-trip을 줄이는 것이 아니라 disk I/O, row materialization, filesort/temp table, lock wait, Redis hot-key 병목을 줄이는 것이다. 운영 DB에서 실행하기 전에는 반드시 백업과 staging 검증을 먼저 수행한다.

## 0. 검토 결론

### 2026-10-15: #920 세 번째 구간 — group closure 증분 갱신

권위 원천은 PostgreSQL `organization_groups`의 adjacency(상위 그룹 연결·활성 상태)이며, `organization_group_closure`는 같은 DB 트랜잭션에서 유지하는 파생 관계다. TTL이 있는 권한 캐시가 아니다. 그룹 하나를 변경할 때 영향받는 활성 하위 트리의 기존 관계만 읽고, 정규 관계와 비교하여 삭제/삽입/깊이 수정분만 반영한다. 나머지 관계는 재삽입하지 않는다. 초기 기동에서는 전체 파생 관계를 검증·차이 조정하되 이미 정상인 행은 쓰지 않는다. 잘못된 활성 계층(순환·누락/비활성 부모)은 묵인하지 않는다. 수동 DB 변경은 지원되는 운영 경로가 아니며 유효하지 않은 adjacency 자체를 자동 복구한다고 주장하지 않는다.

그룹 레코드와 closure 변경은 SERIALIZABLE 트랜잭션 안에서 함께 커밋/롤백한다. 이 서비스의 계층 writer만 공유하는 transaction advisory lock을 사용하며 미디어·텔레메트리 writer/reader는 이 잠금을 얻지 않는다. SQL/트랜잭션 timeout은 3초, PostgreSQL statement/lock wait는 각각 2초/500ms다. 직렬화·deadlock·lock contention으로 확정된 실패만 최대 3회(50/100ms backoff) 재시도하고, 다른 저장 오류·계층/권한 거부는 재시도하지 않는다. commit 실패 원인도 분류하며 중단은 interrupt flag를 보존한다. 실패는 식별자·SQL·호스트를 포함하지 않는 typed 400/404/409/503으로 전달한다. 기존 서비스의 시스템 관리자 전용 변경 정책, 토큰 무효화와 캐시 전략은 변경하지 않았으며 그 전체 흐름의 cross-service 원자성까지 새로 보장한다는 뜻은 아니다.

로컬 PostgreSQL 16.15의 합성 그룹 1,007개·closure 3,017행에서 동일한 3개 노드 하위 트리를 옮기는 repository 시험을 전후 교대 9회 수행했다. 기존 `b05c82ed` 방식은 매번 6,034행 삭제/삽입, 증분 방식은 12행 변경이었다. p50/p95는 기존 **2,908.824/2,954.739 ms**, 증분 **29.603/70.124 ms**였다. 기존 방식도 동일 DataSource의 단일 SERIALIZABLE 트랜잭션 안에서 실행했다. 비교용 과거 구현은 test-only이며 새 운영 경로는 전체 DELETE/TRUNCATE를 사용하지 않는다. 이름 변경·정상 재기동은 closure 쓰기 0행, 공통 조상 깊이 변경은 기존 키를 UPDATE, 무관한 가지의 실제 행(ctid)은 그대로 유지됨을 검증했다. 이 값은 로컬 repository-only 수치이지 전체 HTTP·운영 서버·미디어 성능 인증 결과가 아니다.

독립 재귀 SQL 및 200회 결정론적 계층 변경 oracle로 결과를 비교하고, 다른 가지 동시 생성·상호 순환 시도·잠금 timeout/복구·DB 중간 실패 롤백·서브트리 이동 전후 읽기 범위·하위 그룹 관리 거부를 시험한다. `scripts/reports/group_closure_evidence.py`가 owned JUnit 4개 suite에서 비식별 수치만 추출한다. 누락 시험은 NOT_RUN, skipped는 BLOCKED, 실패/비정상 결과는 FAIL이며 CI는 PASS만 통과시킨다. 원문 로그·실패 SQL·그룹/장비 식별자는 artifact에 포함하지 않는다. 서버 배포와 실제 모바일/Talkback qualification은 별개다.

### 2026-10-15: #920 두 번째 구간 — 호환형 텔레메트리 keyset 조회

새 opt-in 조회는 `GET /api/telemetry/page?limit=100`이며 서버 내부 REST 계약은 `contracts/rest/v1/telemetry-page.contract.json`이 소유한다. 응답은 기존 `TelemetryReadResponse`를 담는 `items`와 nullable `nextCursor`다. 이후 페이지는 `cursor` 파라미터와 정상 Bearer 토큰을 함께 보낸다. 기존 `/api/telemetry/all` 배열 응답·offset·limit 보정 방식, 모바일 및 대시보드 호출은 변경하지 않았다. 따라서 기존 화면이 자동으로 더 빨라졌다는 의미는 아니다.

새 경로는 기본 100개, 최대 500개만 반환하고 다음 페이지 유무를 위해 DB에서 한 행을 추가 조회한다(최대 501행). 0/초과/잘못된 limit, 빈·너무 긴 cursor, 중복·알 수 없는 쿼리 파라미터 및 offset 혼용은 400이다. 응답은 `Cache-Control: no-store`이고 Redis stale/cache 경로를 사용하지 않는다. JDBC 읽기는 3초 query timeout과 고정된 redacted 503 오류를 사용한다.

커서는 기존 검증 라이브러리의 HS256 JWT로 서명하며 purpose·audience·issuer·만료를 검증한다. 위치 UUID와 사용자·그룹·역할·securityVersion의 길이 구분된 해시를 담고 최대 10분만 유효하다. opaque 계약은 클라이언트가 파싱하지 않는다는 뜻이며 암호화된 저장물은 아니다. 이 커서는 로그인/갱신 토큰이 아니고 실제 접근권한도 담지 않는다. 매 페이지 Bearer 인증과 현재 서버 소유 그룹 필터를 재검사한다. 다른 사용자/그룹/역할/권한 버전의 커서는 403, 변조/만료/다른 purpose는 400이며 Bearer 토큰 대용으로 쓰면 401이다. 같은 유효 사용자에 의한 재조회는 허용하되 로그인 세션 연장 권한은 없다. 원문 커서·UUID는 로그에 남기지 않으며 기존 edge 쿼리 제거 규칙을 유지한다.

정렬은 DB collation의 UUID 오름차순이며 `uuid > last_uuid` 범위 조회다. UUID가 바뀌지 않는 최신값 갱신은 페이지 위치를 밀지 않는다. **live 목록이지 snapshot은 아니다.** 삭제·그룹 변경은 다음 페이지의 현재 상태에 반영되고, 커서 이전 위치에 새 UUID가 생기면 새 순회를 시작해야 보인다. heartbeat 순서가 계속 바뀌는 스트림 목록, 장비/자산 목록까지 이번 단계에서 변환했다고 주장하지 않는다.

실측: 로컬 PostgreSQL 16.15, 합성 `telemetry_latest` 100,000행(요청 그룹 20,000행), 15,000개를 건너뛴 깊은 페이지, 동일 51행 결과, 워밍 후 전후 교대 9회였다. offset p50/p95는 **1.743/1.791 ms**, keyset은 **0.072/0.079 ms**였다. shared buffer hit는 **840 → 8**, 두 쿼리 모두 shared read·임시 I/O는 0이었다. 기존 `(group_id, uuid)` 인덱스를 사용하며 새 인덱스/쓰기 증폭은 없다. 이는 따뜻한 캐시의 SELECT 실행 수치이지 HTTP·UI·텔레메트리 수집 처리량/음성 품질/운영 서버 성능을 증명하지 않는다. 1천만/1억 행은 `NOT_RUN`이다.

재현: `scripts/benchmarks/telemetry_keyset_benchmark.py --run --rows 100000 --repeats 9`. 기존 로컬 전용 DB 가드와 신규 테이블 덮어쓰기 거부를 사용한다. 운영 소유 SQL을 읽고 동일 결과 해시와 실제 UUID 인덱스 range condition을 확인하며 원문 SQL/조건/UUID를 출력하지 않는다. CI는 절대 시간 대신 결과·범위 실행계획 계약을 검사하고 `telemetry-keyset-benchmark` JSON artifact를 보존한다. `scripts/smoke/telemetry_page_smoke.py`는 리디렉션·ambient proxy를 차단한 localhost 읽기 전용 시험으로, 실제 edge에서 기존 배열/새 순회 동일성, 중복, no-store, 미인증·커서 대용 인증·다른 신원·잘못된 요청 거부를 검증한다. 서버 배포와 실기기 검증은 별개다.

### 2026-10-15: #920 첫 구간 — 메타데이터 저장과 통계 쿼리 측정

장비 저장은 PostgreSQL의 원자적 upsert로 기존 장비의 불필요한 재조회(센서/스트림 포함)를 제거하고, 동일 트랜잭션 안에서 메타데이터 변경분만 반영한다. 기존 장비 저장의 SELECT는 3회에서 2회로 줄어든다. 센서 2개·스트림 1개가 변경되지 않은 시험에서는 기존의 행 삭제/재삽입 6회가 0회가 된다. 장비 본체 저장은 유지되므로 전체 DB 쓰기가 0회라는 뜻은 아니다. 순서만 바뀐 목록은 쓰지 않으며, 수정 행은 기존 생성 시각을 보존한다. 중복 키·메타데이터 실패는 장비 본체까지 롤백한다. 요청/응답·인증/그룹 정책·모바일 코드는 변경하지 않는다.

통계 쿼리는 운영 구현을 **교체하지 않았다**. 로컬 PostgreSQL 16.15의 합성 운영 이벤트 100,000건, 전체 스트림 100개, 동일 결과 해시, 워밍 후 전후 교대 9회 측정에서 다음 결과를 얻었다. 이는 텔레메트리 수집·음성·실기기 시험이 아니다.

| 대안 | work_mem | 기존 p95 | 대안 p95 | 판단 |
| --- | --- | --- | --- | --- |
| ROW_NUMBER + 조건 집계 | 4,096 KiB | 88.156 ms | 93.607 ms | 느려서 미채택 |
| DISTINCT ON + 윈도 통계 | 4,096 KiB | 94.556 ms | 85.281 ms | 단일 조건 개선만으로 채택하지 않음 |
| DISTINCT ON + 윈도 통계 | 64 KiB | 97.952 ms | 138.121 ms | 저메모리 회귀로 미채택 |

마지막 조건에서 임시 블록 읽기/쓰기는 기존 2,497/2,697에서 대안 5,137/4,857로 증가했다. 기본 메모리 조건에서는 양쪽 모두 shared hit 1,429, shared read 0, 임시 읽기/쓰기 831/833이었다. 캐시가 따뜻한 SELECT 시험이므로 디스크 내구성, 쓰기 증폭 또는 실제 서버의 응답 개선을 증명하지 않는다. H2 호환성 문제도 별도로 발견했으며 실서비스 SQL에는 두 대안을 적용하지 않는다.

재현 도구는 `scripts/benchmarks/operational_event_query_benchmark.py`이다. 운영 SQL에서 권한 필터와 파라미터를 읽으며, 실험 SQL은 `event_query_candidates.py`에만 존재한다. 기본 실행은 비접속 `NOT_RUN`; `--run`은 로컬 전용 DB `gcs_query_benchmark`, 사용자 `benchmark` 및 허용된 로컬 호스트만 수락하고 기존 테이블을 덮어쓰지 않는다. 재측정은 `--read-only`로 행을 변경하지 않는다. `--candidate ranked|window`, `--work-mem-kb 64|4096`, `--baseline-ref <immutable-commit>`을 지정할 수 있다. 보고서에는 SQL 해시, p50/p95, 루트 버퍼·임시 블록·디스크 정렬 수를 남기며 SQL 본문·장비 식별자·자격증명은 출력하지 않는다. CI는 결과 동일성 및 경계 계약을 검사하고 측정 JSON을 artifact로 보존한다. 시간 수치 자체는 결정론적 CI 통과 기준이 아니다.

**남은 #920 범위:** 호환 가능한 keyset 확장, 그룹 closure 증분 갱신과 재시도, 검색 인덱스·쓰기 증폭 검토, rollup 및 1천만/1억 건 검증. 이 규모와 실제 텔레메트리 부하 시험은 `NOT_RUN`이며 #920을 완료 처리하지 않는다. 서버 배포는 하지 않는다.

제공된 DB/Redis 튜닝 항목은 방향이 맞다. 다만 GCS-Saker는 실시간 스트리밍 시스템이므로 아래 기준으로 구체화한다.

- `EXPLAIN ANALYZE`로 Full Table Scan, index 사용 여부, 실제 row 수, loop 수, join 순서를 먼저 확인한다.
- `SELECT *`는 금지한다. 인증, refresh, gateway existence check처럼 hot path는 필요한 column만 projection한다.
- index column을 함수로 감싸거나 타입이 다른 값과 비교하지 않는다. 이는 index range/ref 접근을 막을 수 있다.
- 복합 index는 “카디널리티가 높은 컬럼 우선”만으로 결정하지 않는다. equality 조건, range 조건, `ORDER BY`, `GROUP BY` 순서까지 같이 본다.
- Redis는 cache-aside, session/refresh store, stream list/presence cache에만 제한적으로 사용한다. video/media frame 자체를 Redis로 보내지 않는다.
- Redis key에는 TTL을 기본으로 둔다. `KEYS`, 큰 `HGETALL`, 큰 `SMEMBERS`처럼 single-thread event loop를 오래 점유하는 명령은 운영 경로에서 금지한다.

## 1. 먼저 확인할 실행 순서

운영 DB에서 튜닝은 아래 순서로 진행한다.

1. 현재 인덱스 확인

```sql
SHOW INDEX FROM users;
SHOW INDEX FROM company;
SHOW INDEX FROM telemetry_realtime;
SHOW INDEX FROM gateway;
SHOW INDEX FROM gateway_assets;
SHOW INDEX FROM unmanned_assets;
```

2. 실제 실행 계획 확인

M7 전환 경로의 핵심 쿼리는 먼저 아래 contract script로 확인한다.

```bash
scripts/benchmarks/m7_db_query_plan_contract.py --check
scripts/benchmarks/m7_db_query_plan_contract.py
```

첫 번째 명령은 JSON schema와 대상 쿼리 목록을 출력한다. 두 번째 명령은 운영 DB 또는 staging DB에서 실행할 `EXPLAIN ANALYZE` SQL을 출력한다. 실제 운영 DB 실행 전에는 backup/staging에서 먼저 검증한다.

현재 M7 query plan contract 대상:

- `operational_events_keyset_page`
- `operational_events_metrics`
- `operational_events_severity_counts`
- `telemetry_latest_lookup`

```sql
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM users;

EXPLAIN ANALYZE
SELECT
  EXISTS(SELECT 1 FROM users WHERE username = 'operator01') AS username_exists,
  EXISTS(SELECT 1 FROM users WHERE email = 'operator01@example.com') AS email_exists;

EXPLAIN ANALYZE
SELECT id
FROM company
WHERE invite_code = 'A4AI01'
LIMIT 1;

EXPLAIN ANALYZE
SELECT username, password_hash, role
FROM users
WHERE username = 'operator01'
LIMIT 1;

EXPLAIN ANALYZE
SELECT id
FROM gateway
WHERE uuid = 'raw.local.webcam'
LIMIT 1;

EXPLAIN ANALYZE
SELECT ua.*
FROM unmanned_assets ua
JOIN gateway_assets ga ON ga.asset_id = ua.id
WHERE ga.gateway_id = 1;

EXPLAIN ANALYZE
SELECT *
FROM telemetry_realtime
WHERE uuid = 'raw.local.webcam'
LIMIT 1;
```

3. 실행계획에서 반드시 볼 항목

- `type`: MySQL classic explain에서는 `ALL`을 피하고 `const`, `eq_ref`, `ref`, `range`를 우선 목표로 둔다.
- `key`: 기대한 index가 실제 선택되었는지 확인한다.
- `rows`: 예상/실제 읽는 row 수가 요청 규모에 비해 과하지 않은지 본다.
- `Extra`: `Using filesort`, `Using temporary`가 hot path에 나오면 index/order 설계를 재검토한다.
- `actual time`, `loops`: nested loop가 과도하게 반복되는지 확인한다.
- join 순서: 작은 결과 집합을 먼저 만들고 큰 테이블을 PK/FK index로 따라가야 한다.

4. 누락 인덱스만 추가

```sql
CREATE INDEX idx_gateway_assets_asset_id
ON gateway_assets (asset_id);
```

5. 통계 최신화

```sql
ANALYZE TABLE users;
ANALYZE TABLE company;
ANALYZE TABLE telemetry_realtime;
ANALYZE TABLE gateway;
ANALYZE TABLE gateway_assets;
ANALYZE TABLE unmanned_assets;
```

6. 다시 실행 계획 비교

```sql
EXPLAIN ANALYZE
SELECT ua.*
FROM unmanned_assets ua
JOIN gateway_assets ga ON ga.asset_id = ua.id
WHERE ga.gateway_id = 1;
```

7. MySQL session 지표 비교

```sql
SHOW SESSION STATUS LIKE 'Handler_read%';
SHOW SESSION STATUS LIKE 'Select_scan';
SHOW SESSION STATUS LIKE 'Created_tmp%';
SHOW SESSION STATUS LIKE 'Innodb_row_lock%';
```

관찰 기준:

- `Handler_read_rnd_next`가 줄면 full scan 또는 비효율적 row scan이 줄어든 것이다.
- `Select_scan`이 증가하면 index 미사용 가능성이 있다.
- `Created_tmp_disk_tables`가 증가하면 memory temp table이 disk로 spill된 것이다.
- `Innodb_row_lock_waits`, `Innodb_row_lock_time`이 증가하면 transaction 범위나 write path를 봐야 한다.

## 2. Signup query 튜닝

기존 흐름:

1. `users.username = ?` 조회
2. `users.email = ?` 조회
3. `company.invite_code = ?` 조회

개선 흐름:

1. `EXISTS(users.username = ?)`와 `EXISTS(users.email = ?)`를 한 SQL statement 안에서 수행
2. `company.invite_code = ?`에서 `id`만 projection

필요한 인덱스:

- `users.username`: unique/index
- `users.email`: unique/index
- `company.invite_code`: unique

기대 효과:

- 회원가입 중복 검사 DB round-trip이 2회에서 1회로 감소한다.
- 전체 signup 사전 조회는 3회에서 2회로 감소한다.
- 기존 `OR` 방식은 optimizer가 `index_merge` 후 row를 materialize할 수 있다.
- `EXISTS` subquery는 username/email unique index에서 존재 여부만 확인하고 결과 row를 만들지 않는다.
- 중복 검사에서 `password_hash`, `company_id`, `role` 같은 불필요한 user payload를 읽지 않는다.

주의:

- MySQL에서 확인할 지표는 `EXPLAIN ANALYZE`의 `rows`, `loops`, `actual time`이다. 기대 형태는 username/email 각각 unique index lookup 1회다.

## 3. Login / Refresh query 튜닝

현재 흐름:

- `users.username = ?` 단일 조회

필요한 인덱스:

- `users.username` unique/index

추가 후보:

```sql
EXPLAIN ANALYZE
SELECT username, password_hash, role
FROM users
WHERE username = 'operator01'
LIMIT 1;
```

기대 효과:

- 이미 unique index 기반 조회라 row scan은 거의 1건이다.
- ORM 객체 전체를 만들지 않고 필요한 scalar columns만 읽는다.
- login은 `username`, `password_hash`, `role`만 읽고, `email`, `company_id`는 읽지 않는다.
- refresh는 token subject가 이미 있으므로 `role`만 읽는다.
- access token 검증 결과를 짧은 TTL로 cache할 때는 사용자별 role 변경/계정 잠금 전파 정책이 먼저 필요하다.

## 4. Asset 조회 튜닝

기존 흐름:

1. `gateway.uuid = ?` 조회
2. `gateway_assets.gateway_id = ?` 매핑 목록 조회
3. `unmanned_assets.id IN (...)` 조회

개선 흐름:

1. `gateway.uuid = ?`로 `gateway.id`만 projection해 gateway 존재 확인
2. `gateway_assets JOIN unmanned_assets`로 asset 목록 조회

필요한 인덱스:

- `gateway.uuid`: unique/index
- `gateway_assets(gateway_id, asset_id)`: composite primary key
- `unmanned_assets.id`: primary key
- `gateway_assets.asset_id`: reverse lookup용 index

기대 효과:

- asset 조회 DB round-trip이 3회에서 2회로 감소한다.
- gateway 존재 확인 단계에서 gateway row 전체가 아니라 PK만 읽는다.
- application layer에서 `asset_ids` list를 만들고 `IN (...)`을 구성하는 비용이 사라진다.
- gateway 하나에 asset이 N개 연결된 경우에도 DB optimizer가 join 순서를 결정할 수 있다.

## 5. Telemetry upsert 튜닝

현재 흐름:

1. `telemetry_realtime.uuid = ?` 조회
2. 있으면 ORM update
3. 없으면 insert

필요한 인덱스:

- `telemetry_realtime.uuid`: primary key

MySQL 전용 개선:

```sql
INSERT INTO telemetry_realtime (
  uuid, latitude, longitude, altitude, velocity, epochTime
) VALUES (
  'raw.local.webcam', 35.8714, 128.6014, 120.0, 8.5, 123
)
ON DUPLICATE KEY UPDATE
  latitude = VALUES(latitude),
  longitude = VALUES(longitude),
  altitude = VALUES(altitude),
  velocity = VALUES(velocity),
  epochTime = VALUES(epochTime);
```

기대 효과:

- select 후 update/insert의 2단계 round-trip을 1단계 upsert로 줄인다.
- 고빈도 GPS/telemetry ingest에서 DB 왕복이 절반 가까이 줄어든다.
- PK 충돌 판정은 B-Tree primary key lookup으로 처리된다.
- `SELECT` 후 application이 update/insert를 결정하는 race window가 사라진다.

주의:

- 현재 테스트는 SQLite in-memory도 사용하므로 SQLite에서는 기존 ORM fallback을 유지한다.
- MySQL/MariaDB session에서는 SQLAlchemy MySQL dialect `insert().on_duplicate_key_update(...)` 경로를 사용한다.

## 6. Index 설계 기준

인덱스는 읽기를 빠르게 하지만 write path의 비용을 늘린다. telemetry ingest처럼 쓰기가 많은 테이블은 필요한 index만 둔다.

### 6.1 단일 인덱스

- `users.username`, `users.email`, `gateway.uuid`, `telemetry_realtime.uuid`처럼 고유 lookup에 사용되는 컬럼은 unique/primary key index가 맞다.
- 낮은 선택도 컬럼, 예를 들어 `status = 'online'`처럼 대부분 같은 값을 가지는 컬럼은 단독 index 효과가 작을 수 있다.

### 6.2 복합 인덱스 순서

복합 인덱스는 다음 순서로 판단한다.

1. equality 조건 컬럼
2. range 조건 컬럼
3. 정렬/그룹 컬럼
4. projection-only covering 컬럼

예시:

```sql
-- stream event 목록에서 최근 warn/error를 본다면
CREATE INDEX idx_operational_events_severity_created_at
ON operational_events (severity, created_at DESC);
```

이 index는 `WHERE severity = ? ORDER BY created_at DESC LIMIT ?`에서 filesort를 줄이는 후보가 된다. 반대로 `created_at` range 조회가 대부분이라면 `(created_at, severity)`가 더 맞을 수 있으므로 실제 `EXPLAIN ANALYZE`로 판단한다.

### 6.3 Covering index

Covering index는 table row 접근을 생략할 수 있어 disk I/O를 줄인다. 다만 index size가 커져 write 비용과 buffer pool 점유가 늘어난다.

후보:

```sql
-- login projection이 username, password_hash, role만 필요할 때 후보.
-- password_hash가 크므로 실제 적용 전 index size와 write cost를 반드시 비교한다.
CREATE INDEX idx_users_login_covering
ON users (username, password_hash, role);
```

현재는 `users.username` unique index만으로 row scan이 거의 1건이므로 covering index를 즉시 추가하지 않는다. 운영 데이터에서 login latency와 buffer hit ratio가 문제로 확인될 때만 검토한다.

### 6.4 불필요한 인덱스 제거

아래 순서로 제거 후보를 찾는다.

```sql
SHOW INDEX FROM telemetry_realtime;
SHOW INDEX FROM gateway_assets;
SHOW INDEX FROM users;
```

- 쓰기 많은 telemetry table의 중복 index는 제거 후보이다.
- primary key 왼쪽 prefix와 완전히 겹치는 secondary index는 제거 후보이다.
- 제거 전에는 slow query log와 `performance_schema.table_io_waits_summary_by_index_usage`를 확인한다.

## 7. SQL 작성 규칙

### 7.1 `SELECT *` 금지

hot path에서는 필요한 컬럼만 가져온다.

- signup invite check: `company.id`
- login: `users.username`, `users.password_hash`, `users.role`
- refresh: `users.role`
- gateway existence check: `gateway.id`

### 7.2 인덱스 컬럼 변형 금지

금지:

```sql
WHERE DATE(created_at) = '2026-06-01'
```

권장:

```sql
WHERE created_at >= '2026-06-01 00:00:00'
  AND created_at < '2026-06-02 00:00:00'
```

### 7.3 묵시적 형변환 방지

`gateway.id`가 숫자면 숫자로 비교하고, `gateway.uuid`가 문자열이면 문자열로 비교한다. 다른 타입을 넣으면 DB가 column 또는 parameter를 내부 변환하면서 index 사용이 깨질 수 있다.

### 7.4 Offset pagination 지양

운영 이벤트 로그가 커지면 다음 방식은 피한다.

```sql
SELECT *
FROM operational_events
ORDER BY created_at DESC
LIMIT 1000000, 50;
```

권장:

```sql
SELECT id, created_at, severity, message
FROM operational_events
WHERE created_at < '2026-06-01 09:00:00'
ORDER BY created_at DESC
LIMIT 50;
```

## 8. MySQL 운영 파라미터와 lock 기준

### 8.1 Buffer Pool

MySQL/InnoDB는 buffer pool hit ratio가 핵심이다. 단독 DB 서버라면 일반적으로 메모리의 상당 부분을 `innodb_buffer_pool_size`에 배정하지만, GCS-Saker 단일 노드 PoC처럼 dashboard/backend/media/control이 같이 뜨는 서버에서는 Docker/container 메모리와 MediaMTX 사용량을 먼저 뺀 뒤 정한다.

확인:

```sql
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read%';
```

관찰:

- `Innodb_buffer_pool_reads`가 빠르게 증가하면 disk read가 많다는 뜻이다.
- hot lookup이 대부분 index probe인데도 reads가 많으면 buffer pool 또는 index size를 봐야 한다.

### 8.2 Lock 최소화

- telemetry latest upsert는 짧은 단일 statement로 끝낸다.
- signup은 unique constraint를 최종 방어선으로 두고 transaction 범위를 짧게 유지한다.
- refresh/session은 Redis atomic consume이 들어간 뒤 DB transaction과 분리한다.

확인:

```sql
SHOW ENGINE INNODB STATUS;
SHOW SESSION STATUS LIKE 'Innodb_row_lock%';
```

## 9. Redis 전략

현재 Redis의 적절한 역할:

- refresh/session store
- media-control stream list cache
- stream presence/latest status cache
- latest telemetry cache 후보

부적절한 역할:

- WebRTC media frame 저장
- 장기 이벤트 원장
- 대량 로그 검색 저장소

### 9.1 TTL 기준

- stream list cache: 1~5초 수준의 짧은 TTL
- stream presence: heartbeat 기준 TTL
- refresh session: token 만료 시간과 동일하거나 더 짧게
- latest telemetry: 장비 heartbeat보다 조금 긴 TTL

TTL이 없는 Redis key는 운영 장애의 씨앗이므로 새 key contract에는 TTL 정책을 함께 문서화한다.

### 9.2 금지 명령

운영 요청 경로에서 금지:

- `KEYS *`
- 큰 key의 `HGETALL`
- 큰 set의 `SMEMBERS`

대안:

- `SCAN`
- `SSCAN`
- key prefix별 작은 자료구조
- page size를 둔 cursor API

### 9.3 Cache stampede 방지

stream list 같은 hot cache가 동시에 만료되면 media-control 또는 MySQL로 요청이 몰릴 수 있다.

대응:

- TTL에 jitter를 둔다.
- cache miss 시 단일 refresh lock을 둔다.
- stale-while-revalidate 전략을 검토한다.
- Redis 장애 시에는 cache 없이 upstream을 조회하되 timeout을 짧게 둔다.

### 9.4 정합성 정책

- 읽기 많은 stream list: cache-aside
- refresh session: Redis authoritative store
- telemetry latest: Redis latest + MySQL durable log 또는 future time-series DB 분리
- 운영 이벤트: MySQL 원장, Redis는 최근 window cache만 허용

## 10. 이번 코드 반영 요약

- signup 중복 검사는 username/email을 한 번의 query로 합쳤다.
- signup 중복 검사는 `OR` row 조회가 아니라 `EXISTS` index probe로 바꿨다.
- login/refresh/company/gateway 조회는 필요한 column만 projection한다.
- gateway asset 조회는 mapping query와 asset `IN` query를 join query로 합쳤다.
- MySQL/MariaDB telemetry ingest는 atomic upsert statement를 사용한다.
- `gateway_assets.asset_id` reverse lookup index contract를 추가했다.
- endpoint/error/protocol 값은 Python `api.contracts`로 분리했다.

## 11. 다음 DB 작업

1. SQLAlchemy repository layer를 분리한다.
2. 운영 데이터에서 `EXPLAIN ANALYZE` 결과를 수집해 index coverage를 확인한다.
3. `EXPLAIN ANALYZE` 결과를 테스트 fixture 또는 운영 보고서로 저장한다.
4. 실제 운영 데이터 row 수 기준으로 slow query threshold를 정한다.
5. connection pool size와 `pool_recycle`, `pool_size`, `max_overflow`를 운영 부하에 맞춰 조정한다.
6. Redis key contract 문서를 추가하고 TTL/jitter/stampede 정책을 테스트로 고정한다.
7. 운영 이벤트 로그가 커지기 전 cursor pagination과 `(severity, created_at)` 계열 index를 검증한다.

## 12. ORM / Query Builder / Raw SQL 선택 기준

검토 자료: [ORM은 항상 답일까? 대규모 서비스에서 쿼리 성능을 다루는 방법](https://velog.io/@tmdwns1521/ORM%EC%9D%80-%ED%95%AD%EC%83%81-%EB%8B%B5%EC%9D%BC%EA%B9%8C-%EB%8C%80%EA%B7%9C%EB%AA%A8-%EC%84%9C%EB%B9%84%EC%8A%A4%EC%97%90%EC%84%9C-%EC%BF%BC%EB%A6%AC-%EC%84%B1%EB%8A%A5%EC%9D%84-%EB%8B%A4%EB%A3%A8%EB%8A%94-%EB%B0%A9%EB%B2%95)

결론은 ORM을 버리는 것이 아니다. GCS-Saker는 실시간 스트리밍과 운영 대시보드를 같이 다루므로, 경로별로 다른 query 전략을 선택해야 한다.

| 구간 | 기본 선택 | 전환 조건 | GCS-Saker 적용 |
| --- | --- | --- | --- |
| 단순 CRUD | JPA repository / SQLAlchemy ORM | 단일 row 또는 작은 aggregate root | user, invite, group, time sync config |
| 동적 검색 | QueryDSL/Specification 또는 명시 query builder | 조건 조합, 정렬, 필터, page가 자주 바뀜 | event log filter, asset search, future admin user search |
| 긴 목록 | keyset pagination | offset이 커지거나 tail latency가 커짐 | `operational_events` page, event log infinite scroll |
| 통계/운영 그래프 | Raw SQL/JdbcTemplate | `GROUP BY`, 조건부 집계, window function, 실행계획 제어 필요 | `/ops/events/metrics`, RTT/connection/throughput trend |
| 고빈도 latest state | DB upsert + Redis latest cache | select 후 update/insert race 또는 round-trip 증가 | telemetry/GPS latest, stream presence |
| 대량 쓰기 | batch insert/update | row 단위 ORM save가 반복됨 | telemetry history, operational audit future sink |
| 외부 API 동반 작업 | 짧은 DB transaction + 보상/멱등성 | 외부 API가 transaction 안에 들어가려 함 | AI overlay 요청, notification, stream control future path |

### 12.1 JPA/ORM을 쓰는 기준

ORM은 아래 조건에서 유지한다.

- 엔티티 lifecycle과 domain invariant가 중요하다.
- query가 단순하고 실행계획이 안정적이다.
- row 수가 작거나 index lookup 1회로 끝난다.
- transaction 경계가 짧고 명확하다.

GCS-Saker 기준 후보:

- 사용자 계정 생성/수정
- 초대코드 검증
- 조직/그룹 권한 모델
- 운영 설정 저장

단, ORM을 쓰더라도 `SELECT *`에 가까운 엔티티 전체 materialization은 hot path에서 피한다. 필요한 field만 반환하는 DTO projection 또는 read model을 둔다.

### 12.2 Query Builder 계열을 쓰는 기준

동적 조건이 많지만 도메인 모델과 연동되어야 하면 QueryDSL 또는 Spring Data Specification 계열을 검토한다.

후보:

- 이벤트 로그 검색: severity, category, source, time range, keyword 조합
- 장비/자산 검색: 조직, status, type, stream status 조합
- 사용자 관리 화면: role, group, locked status, 최근 접속 시간 조합

주의:

- 동적 조건을 만든 뒤 실제 SQL을 반드시 로그로 확인한다.
- `LIKE '%keyword%'`는 index를 잘 타지 못하므로 운영 데이터가 커지면 full-text index 또는 별도 검색 저장소를 검토한다.
- page는 offset보다 cursor/keyset을 기본값으로 둔다.

### 12.3 Raw SQL을 쓰는 기준

아래 조건에서는 Raw SQL/JdbcTemplate을 허용한다.

- DB aggregate 함수가 핵심이다.
- window function 또는 조건부 집계가 필요하다.
- ORM이 불필요한 join 또는 entity hydration을 만든다.
- 실행계획과 index 사용을 직접 제어해야 한다.

이미 적용된 사례:

- `JdbcOperationalEventRepository.metricsFor`
  - `COUNT(1)`, `SUM(connections)`, `MIN/AVG/MAX(latency_ms)`, `AVG(throughput_mbps)`를 DB에서 집계한다.
  - 전체 event row를 JVM으로 가져와 계산하지 않는다.
- `JdbcOperationalEventRepository.eventPageFor`
  - `occurred_at + id` cursor 기반 keyset pagination을 사용한다.
  - 큰 offset scan을 피한다.

다음 적용 후보:

- connection count / RTT trend를 time bucket으로 집계
- stream별 최근 장애율
- 조직/그룹별 활성 stream 수
- telemetry/GPS latest + history 분리 후 history aggregate

### 12.4 N+1 회귀 기준

기능이 정상이어도 N+1은 운영에서 장애가 된다. 아래 경로는 반드시 query count 회귀 테스트를 둔다.

| 경로 | 위험 | 방어 |
| --- | --- | --- |
| user -> group -> child groups | 조직 계층 순회 N+1 | 필요한 depth projection 또는 recursive query 검토 |
| stream -> telemetry -> asset | stream card 렌더링 N+1 | stream summary read model |
| event -> related stream/asset | 이벤트 로그 상세 N+1 | 상세 열람 시 lazy fetch, 목록은 projection |
| dashboard initial load | 여러 widget이 각자 query | API composition 또는 GraphQL projection |

테스트 기준:

- 작은 fixture에서 query count를 고정한다.
- 목록 API는 page size와 무관하게 query count가 선형 증가하지 않아야 한다.
- GraphQL resolver에는 DataLoader 또는 batch loader를 둔다.

### 12.5 Transaction 기준

트랜잭션은 넓게 잡지 않는다. 특히 외부 API, AI 서버, MediaMTX/coturn 제어, push notification 호출은 DB transaction 안에 넣지 않는다.

권장 순서:

1. DB에서 상태 전이를 짧게 commit한다.
2. outbox/audit/event record를 남긴다.
3. 외부 호출은 비동기 후처리로 실행한다.
4. 실패 시 보상 작업 또는 retry policy를 적용한다.

현재 적용된 방향:

- operational audit publisher는 비동기 후처리로 분리했다.
- executor 거절 또는 sink 실패가 본 요청을 실패시키지 않도록 격리했다.

### 12.6 실행 계획을 보고 결정한다

ORM, QueryBuilder, Raw SQL 중 무엇이 맞는지는 감으로 정하지 않는다.

새 query가 hot path에 들어가면 아래 산출물을 남긴다.

```text
- SQL 원문 또는 생성 SQL
- EXPLAIN / EXPLAIN ANALYZE 결과
- 사용 index
- 예상 row 수와 실제 row 수
- p50 / p95 latency
- row materialization 수
- filesort / temporary table 여부
- transaction lock wait 여부
```

M7 이후 PR 기준:

- 단순 CRUD는 ORM 허용
- 운영 그래프/통계는 Raw SQL 또는 DB projection 우선
- 긴 목록은 keyset pagination 우선
- GraphQL은 projection과 query limit을 함께 둔다
- Redis는 성능 보조 수단이지 정합성 원장의 대체물이 아니다
