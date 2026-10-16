# GCS-Saker DB Query Tuning Guide v0.1

이 문서는 legacy Python/MySQL 경로와 M7 전환 경로에서 DB query 성능을 올리기 위한 실행 순서, 필요한 인덱스, 기대되는 연산 감소를 정리한다. 목표는 단순히 query round-trip을 줄이는 것이 아니라 disk I/O, row materialization, filesort/temp table, lock wait, Redis hot-key 병목을 줄이는 것이다. 운영 DB에서 실행하기 전에는 반드시 백업과 staging 검증을 먼저 수행한다.

## 0. 검토 결론

### 2026-10-16: #920 열세 번째 구간 — 신규·기존 설치 공용 geo migration runner

`deploy/postgres/init/002_geo_migrations.sh`가 신규 DB bootstrap과 기존 DB 운영 적용의 공용 runner다. versioned SQL은 `init/migrations/` 아래 한 벌만 두며, 신규 컨테이너는 entrypoint가 직접 실행하고 기존 설치는 `scripts/ops/apply_geo_migrations.sh`가 동일 runner와 디렉터리를 건강한 Server-01 PostgreSQL 컨테이너의 고유 임시 경로에 복사해 실행한다. wrapper는 승인된 maintenance window와 기존 복구 검증기 형식의 최신 DB backup evidence를 요구한다. 이번 구간에서는 생산 wrapper를 실행하지 않았다.

V001은 앞 단계에서 검증한 `(observed_at,id)` index를 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`로 생성한다. PostgreSQL 공식 문서상 concurrent build는 쓰기를 막지 않지만 두 번 scan하고 더 오래 걸릴 수 있으며, transaction block 안에서 실행할 수 없고 실패 시 invalid index가 남아 쓰기 비용을 계속 낼 수 있다. runner는 session advisory lock, migration SHA-256, DB version table, session 전체 statement/lock timeout, `PGDATA` free-space floor+table-size 기반 preflight를 적용한다. 같은 version의 checksum 불일치, 같은 이름의 invalid/not-ready/다른 정의 index는 자동 삭제·덮어쓰기 없이 중단한다. 정상 index가 생성됐으나 history 기록 전 중단된 경우에는 정의/validity 검증 후 같은 migration을 재실행해 history를 복구할 수 있다. 근거: [PostgreSQL CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/16/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY).

실제 pinned PostGIS 시험5개는 최초 적용+재실행 단일 record, checksum 불일치, 같은 이름의 다른 `(id)` index 거부·보존, 과도한 free-space 요구의 사전 중단, table lock 중 session deadline 실패 후 lock 해제 재실행 복구를 확인한다. 최초 시험에서 preflight의 `pg_total_relation_size`도 table lock에 기다릴 수 있음이 드러나 PGOPTIONS로 모든 psql connection에 deadline을 적용했다. 또 존재하지 않는 index를 `regclass`로 즉시 cast하면 boolean short-circuit 전에42704가 날 수 있어 namespace/relation catalog 조회로 바꿨다. 이 실패들은 시험 fixture에서만 발생했고 production에는 실행하지 않았다.

`geo-schema-migration-evidence`는 JUnit 실제5개 case/count와 source revision만 export하고 stdout/stderr·container/path/SQL을 내보내지 않는다. 실패 FAIL, Docker 부재 skipped BLOCKED, 누락 NOT_RUN이다. migration runner의 성공은 실제 생산 backup restore나 index build 실행을 의미하지 않으므로 둘 다 NOT_RUN으로 남긴다.

다음 단계는 공용 runner를 실제 배포 절차의 stateful maintenance stage에 연결하기 전, backup evidence와 disk preflight의 실제 산출물 형식, concurrent build 중 ingest/read latency, invalid index 운영자 복구 runbook, post-index V38 spill0 재검증을 묶은 qualification이다. 그 후에만 bounded retention caller 전환을 검토한다. 서버 배포·미디어 E2E는 NOT_RUN, 실물 모바일은 BLOCKED다.

### 2026-10-16: #920 열두 번째 구간 — geo retention time index 후보 비교

운영 schema를 바꾸지 않고 pinned production PostGIS의 `gcs_geo.stream_telemetry_points`에 test-only `(observed_at, id)` B-tree를 생성해 V38 후보 선택 쿼리를 전후 비교한다. 100,000행 warm-cache 계획에서 기존 group/stream 계열 index로는 전역 시간순 정리를 충족할 수 없어 Sort와 temp spill이 발생했다. 후보는 `idx_retention_fixture_points_time` index scan을 사용해 Sort0/temp0으로 바뀌었다. 이 이름은 test-only이며 production init/migration에는 존재하지 않는 것을 gate로 확인한다.

로컬 최초 단일 측정에서 baseline candidate plan은 temp491 blocks였고, 후보 index는0이었다. 후보 build는41.638ms, index 크기는3,809,280bytes(약38bytes/기존행)였다. 같은 table에 순차로10,000행씩 INSERT SELECT한 측정은 baseline142.011ms/WAL7,921,525bytes, 후보140.406ms/WAL8,698,741bytes였다. 지연은 단일 warm run이라 개선/회귀를 일반화하지 않고, WAL은 약9.8% 증가한 관측값으로 기록한다. table가 두 번째 insert 전에 더 커지고 cache가 warm해지는 순서 효과가 있어 정밀한 write amplification qualification은 아니다.

`geo-retention-index-evidence`는 baseline Sort/temp, candidate index 사용/Sort0/temp0, index bytes/build time, plan latency, insert latency/WAL의 aggregate만 허용하며 raw SQL/plan/identity/host/token을 내보내지 않는다. 실패 FAIL, skipped BLOCKED, 누락 NOT_RUN이고 source revision에 묶는다. correctness와 선택계획 개선이 확인되어도 production schema change는 NOT_RUN으로 남긴다.

후보는 retention scan에는 분명한 이득이 있지만, 기존 서버에 init SQL만 바꾸면 신규 설치와 기존 설치가 갈라진다. 다음 단계는 신규 설치 init과 기존 설치용 명시적·재실행 가능한 geo schema migration을 한 소유 경로로 만들고, `CREATE INDEX CONCURRENTLY`의 transaction 제약·실패 잔여 index·lock/statement timeout·디스크 여유·rollback/검증을 설계하는 것이다. 그 전에는 V38 caller를 전환하지 않는다. 서버 배포·미디어 E2E는 NOT_RUN, 실물 모바일은 BLOCKED다.

### 2026-10-16: #920 열한 번째 구간 — owner-only 보존기간 배치 primitive·실제 PostGIS 검증

**정합성 primitive는 추가했지만 기존 정리 스케줄러 전환은 보류한다.** V19와 `runtime_maintenance.sh`의 기존 단일 DELETE 호출은 그대로여서 운영 정리의 unbounded 위험이 아직 해소된 것은 아니다. V38은 private DB owner용 `prune_telemetry_history_batch(retention_days, batch_size, as_of_at)`만 추가하며, 기존 함수/호출/보존기간/테이블/index/미디어/모바일을 변경하지 않는다. 자동으로 새로운 삭제를 실행하지 않으며 PUBLIC EXECUTE 권한도 제거한다. 보존기간1~3650일·batch1~1000·finite/non-null/future 아닌 anchor를 boundary에서 검증한다.

한 transaction에 history와 optional geo points를 **각각 최대1,000행** 삭제하며 두 latest 테이블은 건드리지 않는다. UTC의 고정 as_of 기준 cutoff보다 엄격히 과거인 행만 선택한다. 같은 cutoff는 caller가 후속 batch에도 유지해야 하며 각 batch는 따로 commit해야 한다. CTE에서 `FOR UPDATE SKIP LOCKED`로 후보를 잠근 후 `ctid+tableoid`로 삭제해 동일 transaction의 물리 행을 식별한다. 동시 worker의 행 중복 선택을 방지하지만 잠긴 행이 남으면 has_more=true다. 이는 해당 시점의 보수적 잔여 표시이며 이후 도착하는 late event까지 영구적으로 없다는 보장이 아니다. [PostgreSQL row locking](https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE)는 SKIP LOCKED가 row lock만 건너뛰며 table lock은 별도임을 설명한다.

caller는 외부 SELECT를 시작하기 **전에** statement_timeout을1ms~2s, lock_timeout을1ms~500ms로 설정해야 하며 0/초과 설정은22023으로 거부한다. 함수 안에서 timeout만 SET해 이미 실행 중인 외부 statement까지 제한했다고 간주하지 않는다. JDBC fixture는 SET LOCAL을 적용하는 짧은 transaction·3초 query·5초 socket timeout을 사용한다. 실제 slow second-table trigger를100ms 외부 statement timeout으로 취소(57014), table lock을500ms로 취소(55P03)해 첫 테이블 삭제도 rollback됨을 확인했다. [PostgreSQL timeout 정의](https://www.postgresql.org/docs/16/runtime-config-client.html#GUC-STATEMENT-TIMEOUT)는 statement 수신부터 완료까지의 시간과0의 비활성 의미를 규정한다.

시험은 Compose production의 동일한 **pinned PostGIS image digest**와 실제 `001_geo_telemetry.sql`, migration/ownership trigger를 사용한다. 실제 PostgreSQL20개 case는 null/0/초과/±infinity/future, 최소·최대 bounds, UTC cutoff equality·timezone 복원, 두 이력/latest 보존, row skip+동시 live ingest, table/statement timeout rollback·복구, caller rollback, optional geo 부재, PUBLIC 권한 거부, 동시 두 worker의 분리 삭제, 별도 schema migration과 caller search_path 분리를 포함한다. 생산 role·secret·서버에 접속하거나 삭제한 것은 아니다.

최초 전체 회귀에서는 V38의 public 고정 함수 생성이 기존 별도 schema UTC 업그레이드와 충돌했다. 원래 회귀 시험은 그대로 유지하고, migration의 current_schema를 식별자 quoting하여 함수 namespace/search_path/history 참조에 생성 시점에 바인딩하도록 수정했다. SECURITY INVOKER를 명시하고 새 isolated-schema case는 caller search_path가 pg_catalog뿐이어도 다른 schema의 public history를 삭제하지 않음을 검사한다. 미배포 V38만 수정하며 이전 migration checksum은 바꾸지 않는다.

각 history에 expired100,000행을 실제 적재한 뒤1,000행×9 batch만 측정한 로컬 예: p50 **20.631ms**, p95 **25.888ms**, 각 history9,000행 삭제, 각각91,001(fresh1 포함)/91,000행 잔여, owned function9회, WAL1,994,727bytes. 전체 drain/legacy 대비 처리량/SLO 시험은 아니다. outer statement 합계 temp writes **4,245 blocks**가 관찰됐다. 별도 후보 SELECT의 EXPLAIN은 history가 기존 recorded_at index를 사용하고 temp0인 반면 **geo points는 Sort1개·temp447 blocks**임을 확인했다. Geo의 전역 observed_at 정렬 비용을 줄일 index 후보와 write/space 비용을 다음 구간에서 비교해야 한다. 근거 없이 운영 index나 work_mem을 변경하지 않았다.

`telemetry-retention-evidence`는 JUnit 실제20개 실행과 aggregate1개를 검증해 correctness PASS/실패 FAIL/skipped BLOCKED/누락 NOT_RUN을 구분한다. performance_qualification은 points spill이 있으면 FAIL, 아니어도 대규모 qualification 전에는 NOT_RUN이다. 따라서 correctness PASS를 운영 적용 준비 완료로 해석하지 않는다. Raw SQL/UUID/호스트/토큰/plan 원문은 내보내지 않는다.

다음: geo time index 후보의 비용·write amplification 검증 → cutoff 고정/별도 commit/overall budget/skip된 잔여/ack 유실/중단 복구를 갖춘 운영 caller 연결 → 장기 drain·ingest/read 혼합·1천만/1억행 검증. 기존 unbounded scheduler와 Redis Lua SCAN은 이번에 수정하거나 실행하지 않았다. 서버 배포·전체 미디어 E2E는 NOT_RUN, 실물 모바일은 BLOCKED다.

### 2026-10-16: #920 열 번째 구간 — 실제 reader/writer 혼합 부하와 MVCC 경계

실제 migration·ownership trigger·pgJDBC/Hikari·운영 reader/writer를 사용해 **latest100,001행**의 동일 분포에서 2개 reader와 2개 writer를 동시에 실행한다. 기존 실제-schema seed를 재사용하고 트랜잭션당1,000개 identity 상한도 유지한다. 32개 wave에서 reader64회/writer64회가 실행되며 페이지 크기1·500 두 profile을 비교한다. writer는 dense 그룹과 외부 그룹의 고정된 두 identity를 갱신한다. 이 시험은 동시 INSERT에 대한 전체 keyset 순회의 snapshot 보장을 새로 만들거나 주장하지 않는다.

reader는 pool을 공유하며 VIEWER 자기 그룹, OPERATOR 희소 그룹, GROUP_ADMIN 부모, 외부 그룹, 빈 그룹과 첫/깊은/끝 커서를 반복 전환한다. 각 결과의 허용 group·정렬/중복·cursor 범위·lookahead 상한 및 altitude/epoch/observed_at의 동일-event 필드 일관성을 검사한다. 부하 종료 후 history64건·latest행수 불변·최신 event/DTO·history 최대 시각과 latest 일치를 확인한다. 서로 다른 시점의 두 SELECT를 DTO 비교하면 정상적인 중간 commit도 실패로 오인하므로 혼합 시험에는 그런 비교를 사용하지 않는다.

별도의 commit/rollback 2개 시험은 test-only 외부 트랜잭션 안에서 canonical writer를 실행하고 gate로 **미커밋 행과 advisory lock을 실제 유지**한다. 다른 connection의 reader가 gate 해제 전에 이전 DTO를 반환하며 미커밋 history는 보지 못함을 검사한다. 해제 후 commit이면 새 DTO/history1건, rollback이면 이전 DTO/history0건이다. 이는 같은 SELECT 내 tuple 일관성과 READ COMMITTED 가시성 검증이지 latest/history를 별도 HTTP 요청으로 읽었을 때 동일 snapshot을 보장한다는 뜻은 아니다. 모든 gate/future/트랜잭션/pool은 시간 제한과 cleanup을 갖는다.

Docker 로컬 최초 통과 예(각 operation64회; read latency는 DTO 검증 assertion도 포함):

| page size | read p95 (ms) | write p95 (ms) | SELECT / CTE calls | write CTE WAL bytes |
| --- | ---: | ---: | --- | ---: |
| 1 | 2.301 | 10.242 | 64 / 64 | 61,736 |
| 500 | 8.538 | 7.519 | 64 / 64 | 61,550 |

모든 profile의 temp write는0이었다. counters는 post-load 검증 SELECT 전에 수집하며 소유 SELECT/CTE에 한정한다. test-only extension preload/reset 외에 운영 설정·SQL·timeout·index/schema·API·모바일·미디어 동작은 변경하지 않았다. `telemetry-mixed-evidence`는 숫자/고정 profile만 export하고 JUnit 실제 case/count·2 profile×2 operation cell·source revision을 검증한다. parameterized factory가 Docker 부재로 실행되지 않아2개 skipped만 기록된 경우도 PASS가 아닌 BLOCKED/nonzero로 처리한다. 누락 NOT_RUN, 실패 FAIL이다.

이는 작은 횟수의 warm-cache 합성 read/write 및 deterministic 미커밋 가시성 회귀다. 장시간 soak·동시 조직 이동·다수 writer의 장비 등록 경합·대규모 history/retention·1천만/1억행·운영 수용량·실물 모바일 qualification은 남아 있다. 서버 배포와 이번 구간의 전체 미디어 E2E는 NOT_RUN, 실물 모바일은 BLOCKED다.

### 2026-10-16: #920 아홉 번째 구간 — 실제 writer 동시성·잠금·WAL 증거

이전 `telemetry_bulk_flush_benchmark.py`는 buffer/SQL 생성만 측정하는 compile-only 시험이다. 이번에는 **실제 migration과 소유권 trigger를 적용한 PostgreSQL 16, pgJDBC/Hikari, 운영 `OperationalReadJdbcWriter.replaceTelemetry`**를 직접 실행한다. 운영 코드·schema·인덱스·timeout·모바일·미디어 경로는 변경하지 않았다. `pg_stat_statements` preload와 reset은 class가 소유한 disposable Testcontainers DB에만 적용하며 운영 DB를 재시작하거나 통계를 초기화하지 않는다.

4개 worker에서 각 64번 저장을 시도하는 세 가지 고정 profile을 검사한다. 서로 다른 identity는 history64/latest64, 같은 identity의 다른 event는 history64/latest1과 가장 최신 observed_at의 값, 같은 event의 동시 재전송은 history1/latest1을 보장한다. 재전송 전후 latest의 physical tuple을 비교해 실제 UPDATE도 발생하지 않았는지 확인한다. 중복 profile은 먼저 동일 event를 저장한 뒤 통계를 초기화하므로 64회 재전송 비용만 측정한다.

Docker 로컬 최초 통과 예(단일 측정, 전체 함수의 pool borrow/wire/commit 포함 p95):

| profile | p95 (ms) | owned CTE calls | CTE WAL bytes | temp blocks written |
| --- | ---: | ---: | ---: | ---: |
| 서로 다른 identity | 15.544 | 64 | 65,518 | 0 |
| 같은 identity, 다른 event | 16.385 | 64 | 66,080 | 0 |
| 같은 event 재전송 | 14.517 | 64 | 0 | 0 |

각 시도의 **history+latest CTE** 호출 수가1임을 확인하는 것이지, BEGIN/COMMIT/SET까지 전체 DB 왕복이1이라는 뜻은 아니다. 통계는 `track=top`으로 소유 CTE의 calls/exec_ms/shared hits·reads/temp writes/WAL만 수집한다. WAL은 해당 statement에서 발생한 값이며 commit record나 전체 서버 WAL을 대표하지 않는다. exec_ms는 client/pool/commit 시간이 제외되어 함수 latency와 합산하지 않는다. raw SQL/query ID/UUID/호스트/토큰/예외 원문은 evidence로 내보내지 않는다.

별도 시험에서 identity advisory lock을 유지한 채 500ms lock timeout에 따른 typed unavailable·history/latest 전체 rollback, 다른 identity 저장 성공, lock 해제 후 재전송 복구를 확인한다. 등록 장비의 다른 그룹 쓰기와 DISABLED 상태는 모두 거부되고 두 테이블은 보존되며, ACTIVE 복귀 후 저장된다. 기존 두 독립 writer의 다른 그룹 최초 소유권 경쟁 시험도 함께 유지한다. 보호 lock이나 timeout을 완화하지 않는다.

`scripts/reports/telemetry_writer_evidence.py`는 실제 JUnit testcase와 suite count를 대조하고 3개 profile의 aggregate만 허용한다. 실패 FAIL, skipped BLOCKED, 누락 NOT_RUN은 모두 nonzero다. CI는 전체 auth-policy check 이후 `telemetry-writer-evidence`를 immutable source revision과 함께 보존한다. 이는 작은 fixture의 정합성/비용 회귀 증거이며 장시간 soak, 1천만/1억행 history, 대규모 read/write 혼합 부하, 운영 수용량·실물 모바일 qualification은 남아 있다. 이번 구간은 기능 변경이 없어 전체 미디어 E2E를 새로 실행한 것으로 보고하지 않는다.

### 2026-10-16: #920 여덟 번째 구간 — 자기 그룹 keyset 조건·실제 pgJDBC/Hikari 검증

이번 변경은 opt-in `telemetryPageFor`의 VIEWER/OPERATOR에만 기존 권한 WHERE 뒤에 **동일한 서버 소유 group_id 조건을 AND로 추가**한다. 기존 OR/계층/총관리자 조건은 제거하지 않는다. domain의 순수 `TelemetryReadScope.forRole`이 기존 자기 그룹 역할을 명시적으로 선택하고, infrastructure의 `TelemetryPageStatement`가 principal의 group을 바인딩한다. 새 역할 추가 시 exhaustive when을 다시 검토해야 한다. GROUP_ADMIN/ADMIN 쿼리와 파라미터는 이전과 바이트 단위로 같다. 미디어의 총관리자 차단 정책과 이 운영 telemetry 조회 선택은 별개이며 어떠한 미디어 권한도 새로 부여하지 않는다.

추가 AND는 generic plan에도 기존 `(group_id, uuid)` 인덱스 범위를 명시한다. 새로운 인덱스·migration·JDBC 전역 설정·API 계약은 없다. 기존 `/telemetry/all` 배열/offset 경로, 모바일·대시보드 호출도 바꾸지 않는다. 따라서 기존 화면이 자동으로 빨라진다는 뜻은 아니며, 실제 최적화 대상은 opt-in keyset 소비자다. cursor 서명/사용자·그룹·역할·securityVersion 바인딩, 매 요청 authoritative 인증 읽기, no-store, 3초 읽기 timeout과 redacted503은 유지한다.

실제 pgJDBC **42.7.12**와 HikariCP를 사용해 migrated PostgreSQL의 **100,000행+외부 그룹 대조1행**을 검사한다. pool 크기1로 동일 physical backend PID를 유지하며 서로 다른 principal의 그룹/역할을 바꿔 읽는다. 드라이버의 V3 protocol prepared statement가 만들어졌는지 서버 `pg_prepared_statements`로 확인하고, 기존7/추가조건8개 파라미터 statement가 custom/generic을 실제 사용했는지 검증한다. pool/statement/connection은 각각 명시적으로 종료한다. 테스트의 prepareThreshold5·connect/socket/query timeouts는 시험용이며 운영 설정을 바꾸지 않는다.

로컬 reader 전체(pooled borrow+wire+DTO mapping 포함)를 기존/새 조건 교대9회 측정한 예:

| p95 (ms) | 기존 | 자기 그룹 AND |
| --- | ---: | ---: |
| auto 희소 그룹 | 1.949 | 2.272 |
| custom 강제 희소 그룹 | 2.098 | 2.116 |
| generic 강제 희소 그룹 | 6.920 | 1.710 |
| generic 강제 빈 그룹 | 12.326 | 1.223 |

auto/custom에서는 wire·매핑 비용 수준의 차이와 변동이 있고, 범용적인 사용자 체감 개선을 주장하지 않는다. generic 희소/빈 범위의 비용 폭증을 방지하는 것이 목적이다. 실제 generic EXPLAIN은 group_id와 uuid가 모두 Index Cond에 있고 temp spill이 없음을 확인한다. 높은 역할은 기존 SQL 그대로라 이전 UNION/LATERAL 후보의 계층별 K개 재정렬 비용을 도입하지 않는다. 근거: [pgJDBC server preparation](https://jdbc.postgresql.org/documentation/server-prepare/), [Hikari configuration](https://github.com/brettwooldridge/HikariCP#configuration-knobs-baby).

검증은 모든 DTO·정렬·중복·상한을 기존 reader와 비교하며 첫/깊은/끝 커서, size1/100/500, 빈 그룹, sibling 거부, 같은 physical connection의 사용자/역할 전환, 부모의 외부 그룹 차단과 기존 ADMIN 운영조회 동작을 포함한다. page/cursor/controller 및 실제 PostgreSQL timeout/복구 회귀도 함께 실행한다. 실물 모바일·동시 다중 pool 부하·1천만/1억행·생산 SLO까지 qualification한 것은 아니다.

초기 실제-schema fixture는 10만 건을 한 트랜잭션으로 적재해 소유권 보호 trigger의 per-identity advisory lock shared memory를 소진했다. 이를 연결 장애나 운영 쿼리 회귀로 처리하지 않는다. 보호 trigger/DB 설정은 그대로 두고 시험 seed만 1,000건 단위의 짧은 트랜잭션으로 분리한 뒤 통과했다. `scripts/reports/telemetry_own_scope_evidence.py`는 owned JUnit5개 suite에서 숫자·정해진 profile/드라이버 버전만 추출한다. 실패는 FAIL, skipped는 BLOCKED, 누락은 NOT_RUN이며 raw SQL/UUID/호스트/토큰/로그 원문을 artifact로 내보내지 않는다. 이전 SELECT-only benchmark들은 기존 base SQL 비교로 유지하며 실제 새 reader의 증거는 `telemetry-own-jdbc-evidence`가 담당한다.

### 2026-10-16: #920 일곱 번째 구간 — scope-first SELECT 후보 비교

**결론: generic의 희소/빈 그룹 병목은 줄지만 auto의 계층 조회 비용이 늘어 전체 교체는 보류한다.** `scripts/benchmarks/telemetry_scoped_candidate.py`는 소유 SQL의 projection·7개 파라미터·계층 역할 literal·전체 scope 조건을 검증한 뒤 test-only SELECT 후보를 만든다. 운영 SQL/JDBC/인덱스/정책/API/모바일은 변경하지 않았다.

후보는 전체 허용, 자기 그룹, 하위 그룹을 서로 겹치지 않는 UNION ALL로 나누고, 각 범위의 UUID index를 먼저 읽는다. 하위 그룹은 현재 closure를 조회하여 LATERAL로 그룹별 상위 K개를 가져온 뒤 전체 UUID 정렬·상위 K개를 계산한다. UUID가 고유하고 group ownership이 단일하며 closure의 ancestor/descendant가 고유하다는 기존 DB 조건을 전제로 한다. 분기별 상위 K개를 합쳐도 전체 상위 K개를 얻을 수 있지만, 작업량은 하위 그룹 수×K에 따라 커질 수 있다. SQL 역할 조건은 기존 소유 조건과 같은 입력을 사용하며, 역할별 API를 새로 만들거나 클라이언트에 scope 결정을 맡기지 않는다. 참고: [PostgreSQL LATERAL](https://www.postgresql.org/docs/16/queries-table-expressions.html#QUERIES-LATERAL), [UNION](https://www.postgresql.org/docs/16/queries-union.html).

예비 후보는 자기 그룹 제외를 LATERAL 안에서 검사하여 자기 그룹 행을 불필요하게 읽었다. 제외 조건을 closure 바깥쪽에 먼저 적용한 최종 후보에서는 좁은 부모의 auto p95가 예비 약 21.4ms에서 0.237ms로 줄었다. 이 수정은 benchmark-only이며 배포된 쿼리의 버그 수정이라는 뜻은 아니다.

로컬 PostgreSQL16.15 **1,000,000행**, 희소 그룹1,000행·하위32그룹, 기존/후보×auto/custom/generic×12프로필×9회 비교다. 모드별 변형 순서를 교대하고 각 변형 내부 프로필 순서를 회전한다. 계획 선택 횟수는 기존 `pg_prepared_statements` 검증을 재사용한다.

| 조회 p95 (ms) | 기존 auto | 후보 auto | 기존 generic 강제 | 후보 generic 강제 |
| --- | ---: | ---: | ---: | ---: |
| 희소 그룹 앞 페이지 | 0.051 | 0.164 | 9.451 | 0.149 |
| 빈 그룹 | 0.036 | 0.067 | 177.669 | 0.145 |
| 넓은 부모 앞 페이지 | 0.157 | 1.589 | 0.209 | 1.263 |
| 좁은 부모 깊은 페이지 | 0.067 | 0.237 | 0.099 | 0.380 |
| 최대 501행 | 0.176 | 0.344 | 0.242 | 0.254 |

generic 희소 그룹 첫 sample buffer hits는 19,912→54, 빈 그룹은 386,059→3이었다. 반대로 넓은 부모의 auto buffer hits는 213→1,740이었다. 실제 pool의 auto가 이미 custom을 잘 선택한다면 전체 후보로 교체해 얻는 이득이 없거나 오히려 회귀할 수 있다. 따라서 기존 auto/SQL을 유지하고, 이후에는 서버가 검증한 **자기 그룹 범위에만** 간결한 조회 형태를 적용할 수 있는지 실제 pgJDBC/pool와 함께 검토한다. 이는 후속 후보이지 이번에 운영 적용한 사항이 아니다.

실제 PostgreSQL에서 독립 그룹 allowlist oracle와 모든 컬럼·정렬·상한·중복·그룹 범위를 대조했다. 추가 6개 SQL NULL/서로 다른 role 파라미터 조합도 기존과 같음을 확인했다. `IS NOT TRUE`는 원래 OR의 SQL 삼중값 의미를 보존하기 위함이며, 이 비정상 조합을 인증 API가 허용한다는 뜻은 아니다. 원본/후보 각각 **동일한 prepared statement를 유지한 채** closure의 child 한 건을 제거하고, 다음 EXECUTE에서 해당 하위 범위가 사라지는지 검사한 뒤 fixture 관계를 복원한다. 동시 그룹 이동이나 실제 사용자 token lifecycle을 새로 qualification한 것은 아니다.

warm-cache SELECT-only 시험이며 K는1/51/501을 포함한다. 실제 pgJDBC transport/pool, write/WAL, 많은 하위 그룹, concurrent reparenting, 1천만/1억행, 전체 HTTP/미디어 성능은 미검증이다. CI는 다른 benchmark의 파생 DB를 덮어쓰지 않도록 **별도 disposable PostgreSQL**에서100,000행/3회 실행하고 `telemetry-scoped-candidate` artifact를 남긴다. 기본 CLI는 접속 없이 NOT_RUN이고 실패는 redacted FAIL/nonzero이며, 정상·실패 모두 소유 connection 종료로 prepared state를 정리한다. PASS는 결과/경계/계획 시험 통과이지 후보 채택 승인이나 보편적 속도 개선을 뜻하지 않는다.

최초 CI 후보 단계가 기동 직후 실패하여 준비 상태 검사도 보완했다. 공식 postgres 이미지의 임시 초기화 서버는 Unix socket만 열며 TCP를 열지 않는다. 소켓 기반 `pg_isready`를 그대로 사용하면 실제 benchmark TCP 연결보다 먼저 성공할 수 있다. 10초의 한정된 init 지연을 넣은 별도 Docker fixture에서 **socket ready / TCP not ready**, 이어서 최종 TCP ready 전환을 재현했다. CI는 `pg_isready -h 127.0.0.1`로 최종 TCP 서버를 기다리며, unit contract도 host 지정 누락을 막는다. 원래 CI 실패는 유지하고 기동 조건을 강화한 새 커밋으로 전체 CI를 다시 실행한다. 운영 PostgreSQL 설정이나 timeout/성능 합격선을 완화하지 않았다.

### 2026-10-16: #920 여섯 번째 구간 — prepared plan·그룹 분포 편향 검증

**결론: 이번 혼합 부하의 auto는 custom plan을 유지했고 결과도 정상이다. 다만 generic plan 강제는 희소/빈 그룹에서 큰 회귀를 만들었다.** 운영 JDBC/DB 설정·SQL·인덱스·API·모바일 경로는 변경하지 않았다. `scripts/benchmarks/telemetry_prepared_benchmark.py`는 소유 telemetry keyset SELECT의 7개 파라미터를 순서 그대로 `$1..$7`로 바꿔 실제 SQL PREPARE/EXECUTE를 실행한다. auto/force_custom_plan/force_generic_plan을 별도 prepared statement 수명으로 비교하고, `pg_prepared_statements`의 실제 선택 횟수로 요청 모드가 실행됐는지 검증한다. pgJDBC transport/connection-pool 자체의 qualification은 아니며 운영 환경의 유효 설정도 읽지 않았다.

새 로컬 schema 안의 **1,000,000행**을 dense 그룹 약 90%, sparse 그룹 0.1%(1,000행), 나머지 32개 하위 그룹으로 구성했다. 각 모드에서 동일 statement로 역할/그룹/커서를 섞은 6회 warmup 후, 12개 프로필을 각 9회 순서를 회전해 측정했다. 자기 그룹, 좁은/넓은 부모, 전체, 빈 그룹, 앞/깊은/끝 커서, 최소 1행과 최대 501행(500개 API 상한+추가 확인 1행)을 포함한다. 독립 그룹 allowlist oracle와 전체 컬럼·정렬·건수·중복·scope를 비교하며 원문 UUID/그룹/SQL/plan을 산출물에 남기지 않는다.

| 조회 p95 (ms) | auto | custom 강제 | generic 강제 |
| --- | ---: | ---: | ---: |
| dense 앞 페이지 | 0.062 | 0.092 | 0.187 |
| sparse 앞 페이지 | 0.073 | 0.054 | 8.454 |
| sparse 깊은 페이지 | 0.065 | 0.069 | 7.892 |
| 빈 그룹 | 0.043 | 0.028 | 166.949 |
| 최대 501행 | 0.179 | 0.193 | 0.406 |

auto/custom은 각각 custom 126회·generic 0회, generic 강제는 custom 0회·generic 126회였다(6 warmup+12 결과 비교+108 측정). sparse 앞 페이지의 첫 sample buffer hits는 auto 54 / generic 19,914, 빈 그룹은 3 / 386,064였다. **모든 사례에서 UUID range 조건이 보이더라도 저비용 조회라는 뜻은 아니다.** generic은 뒤쪽 UUID 범위를 순서대로 읽으며 그룹 조건에서 대량 탈락시킬 수 있다. 기존의 `uuid_range_scan=true` 단일 신호만으로 일반 성능 보장을 하지 않는다.

이는 warm-cache 합성 PostgreSQL 16.15 SELECT-only 측정이며 mode 순서는 auto/custom/generic으로 고정되어 있다. fixture는 소유 keyset fixture를 재사용한 뒤 그룹 분포를 한 번 UPDATE하고 ANALYZE한다. 운영 ingest/WAL 비용·실제 pool의 statement 사용 분포·transport·lock·1천만/1억행은 미검증이다. 자동 계획이 이번에 custom을 유지했다는 사실을 모든 사용자 부하나 운영 환경의 보장으로 확대하지 않는다. [PostgreSQL PREPARE](https://www.postgresql.org/docs/16/sql-prepare.html)는 auto가 첫 다섯 custom 비용과 generic 추정 비용을 비교함을 설명하고, [pgJDBC server prepare](https://jdbc.postgresql.org/documentation/server-prepare/)는 transport 측 별도의 prepare 수명과 설정을 설명한다.

현재 조치는 **전역 generic/custom 강제를 도입하지 않고 기존 auto/SQL을 유지**하는 것이다. 후속 개선 후보는 현재 서버 소유 scope를 먼저 제한한 조회 형태를 SELECT-only 비교하고, 실제 pgJDBC/pool 혼합 부하에서도 동일 결과·음수 권한 시험과 비용을 검증하는 것이다. 역할별 API를 복제하거나 브라우저에 group 필터/정책을 넘기지 않는다. 새 인덱스 없이 group/UUID 접근량을 줄일 수 있는지는 별도 evidence로 판단한다.

재현은 새 로컬 `gcs_query_benchmark` DB의 `telemetry_prepared_benchmark` namespace에서만 허용한다. 기존 namespace는 DDL 전에 거부하고, public을 search_path에서 제외해 앞선 benchmark의 동명 테이블을 잘못 재사용하지 않는다. 정상 모드는 소유 statement만 DEALLOCATE하며 오류 시 연결 종료로 남은 statement를 해제한다. 기본 CLI는 접속 없이 NOT_RUN, 실패는 redacted FAIL/nonzero다. CI는 100,000행/3회로 실행하고 `telemetry-prepared-benchmark` artifact를 보존한다. 시험 PASS는 결과와 실제 계획 선택 검증 통과이지 generic 성능 승인·운영 배포 승인이 아니다.

### 2026-10-16: #920 다섯 번째 구간 — 운영 통계·시간 버킷 rollup 후보 검증

**결론: 조회 이득은 확인했지만 실시간 운영 경로 도입은 BLOCKED다.** `scripts/benchmarks/operational_rollup_benchmark.py`는 소유 Kotlin의 전체 aggregate 및 분 단위 bucket SQL을 추출해 test-only materialized view와 비교한다. `metricsFor` 응답 전체(강도별/ICE별/stream-session 포함)를 대체한 것은 아니다. 운영 SQL·API·권한·schema·모바일/화면·송출 경로는 변경하지 않는다.

후보는 그룹과 UTC 분 단위로 count, connections 합계, latency min/max/합계/nonnull count, throughput 합계/nonnull count를 저장한다. 평균은 그룹별 평균을 다시 평균내지 않고 **합계/실제 nonnull 건수**로 계산한다. 응답 시 현재 closure 조건을 원문 그대로 적용하여, 집계표를 새로 만들지 않아도 하위 그룹 이동 후 읽기 범위가 바뀌게 한다. 집계 시 사용자별 권한 결과를 저장하지 않는다. 독립 그룹 allowlist oracle로 자기/하위/전체/빈 그룹을 비교하며 bucket 정렬과 기존 1,440개 상한을 유지한다. 합계·건수는 정확 일치, DB의 numeric/double 평균은 1e-12 허용 오차로 비교한다. 빈 기간과 데이터는 있지만 모든 측정값이 NULL인 분도 포함한다.

로컬 Docker PostgreSQL 16.15, 합성 원시 이벤트 **1,000,000행**, 그룹별 분 집계 **50,001행**, 프로필 7개 × aggregate/bucket × 각각 3회 EXPLAIN ANALYZE 측정이다. 현재 SQL과 후보 순서를 교대하고 index 선택을 강제하지 않는다.

| 조회 p95 (ms) | 원시 SQL | 후보 rollup |
| --- | ---: | ---: |
| 자기 그룹 전체 aggregate | 47.413 | 3.538 |
| 자기 그룹 시간 bucket | 90.752 | 1.650 |
| 하위 그룹 포함 aggregate | 177.142 | 12.966 |
| 하위 그룹 포함 시간 bucket | 322.112 | 18.090 |
| 전체 범위 aggregate | 59.165 | 5.890 |

최초 집계+unique index+ANALYZE 약 **389.1ms**, 추가 집계 저장공간 약 **7.02MiB**, 늦게 도착한 1건 후 전체 REFRESH 약 **332.0ms**였다. 이는 warm-cache 합성 DB-only 결과이며 짧은 3회 p95는 표본 최댓값이다. 전체 refresh의 장시간/동시 reader 차단, WAL/ingest 비용, generic prepared plan, 실제 조회 빈도 및 1천만/1억행은 미검증이다. 실제 HTTP·미디어 개선 수치로 사용하지 않는다.

다음 반례/회복은 실제 PostgreSQL에서 확인했다.

- 분 중간의 `[from, to]`를 bucket 시작시각으로 단순 필터하면 유효 이벤트를 놓친다. 후보는 UTC 분 시작부터 분 끝 `59.999999`까지인 완전한 분 또는 시간 필터 없음만 허용하며, 부분 시간 범위는 실행 전에 거부한다. 기존 API의 임의 시각 범위를 이 제한으로 바꾼 것은 아니다.
- 과거 분으로 늦게 도착한 이벤트는 원시 통계를 즉시 바꾸지만 집계표에는 반영되지 않는다. 시험은 이 불일치를 반드시 검출한 뒤 refresh하여 aggregate/bucket 일치가 회복되는지 확인한다. 같은 이벤트 ID 재삽입은 DO NOTHING으로 중복을 막는다. 원시 데이터는 권위 원천이며 집계표는 별도 파생 snapshot이다.
- closure에서 하위 그룹을 다른 상위 그룹으로 옮긴 후 집계표 refresh 없이 기존 상위의 통계에서 빠지는지 검사한다. 이는 SQL 조회 범위 시험이지 실제 사용자 토큰·membership lifecycle을 새로 검증했다는 의미는 아니다.

따라서 현재 단계에서는 raw SQL을 유지한다. 실제 채택 전에는 arbitrary 경계 분을 raw로 병합하는 정확성, severity/text 등 기존 필터 보존, late/out-of-order event의 idempotent 증분 반영, freshness watermark·무효화·재시작 복구, reader/refresh lock 및 ingest/WAL 예산, 파생 데이터 오류 시 raw fallback 계약이 필요하다. TTL이나 정기 refresh만으로 현재 통계와 항상 같다고 주장하지 않는다. [PostgreSQL materialized view](https://www.postgresql.org/docs/16/rules-materializedviews.html)는 저장 결과가 최신이 아닐 수 있음을 설명하며, [REFRESH](https://www.postgresql.org/docs/16/sql-refreshmaterializedview.html)는 전체 내용을 교체한다. concurrent refresh 지원/unique index 존재만으로 위 freshness 계약이 완성되는 것은 아니다.

재현은 새 로컬 `gcs_query_benchmark` DB의 고정 `event_rollup_benchmark` namespace에서만 허용한다. 이미 존재하면 DDL 전에 실패하고 덮어쓰지 않는다. 실제 재실행 거부 후 원시 1,000,001행 보존을 확인했다. 기본 CLI는 접속 없이 NOT_RUN, 실패는 redacted FAIL/nonzero다. CI는 100,000행/3회 및 의미 반례·회복을 실행하고 `operational-rollup-benchmark` artifact를 보존한다. 시험 PASS와 `production_adoption=BLOCKED`는 의도적으로 별개이며 속도만으로 자동 도입하지 않는다.

### 2026-10-15: #920 네 번째 구간 — 부분 문자열 검색 GIN 도입성 평가

**결론: 운영 인덱스 추가는 보류한다.** `scripts/benchmarks/event_search_index_benchmark.py`는 소유 Kotlin `selectBase`/`andTextQuery`/정렬/limit 상수를 직접 읽어 동일한 SQL을 실행한다. 9개 LOWER/COALESCE 표현식 전체에 대응하는 test-only 다중 표현식 `pg_trgm` GIN을 기본 fastupdate(on) 및 off로 비교한다. 검색 표현식이나 placeholder/그룹 연결 계약이 달라지면 실패한다. 컬럼 결합 검색으로 의미를 바꾸거나 일부 OR 필드를 누락하지 않는다. 권한 정책·서버 SQL·migration·모바일/대시보드 호출은 변경하지 않았다.

로컬 Docker PostgreSQL 16의 변형별 100,000행, 읽기 12개 프로필·각 9회, 동일 1,000행 쓰기 warmup 후 9회 commit 측정이다. 읽기 변형 순서는 회전하고 쓰기 순서는 교대한다. 희귀어·흔한 단어·미일치·1/2글자·한글·NULL 필드·기존 `%`/`_` wildcard 의미·자기/하위/전체 그룹 범위를 비교한다. 각 응답은 최대 51행이며, 세 인덱스 변형 사이 동일한 정렬 결과와 독립 allowlisted-group oracle 일치를 요구한다. 인덱스를 강제 선택하지 않으며 실제 GIN 사용 여부·buffer/scan/filter/spill 수치를 비식별 JSON으로 남긴다.

| 항목 | 기존 B-tree 기준 | GIN fastupdate on | GIN fastupdate off |
| --- | ---: | ---: | ---: |
| 희귀어 검색 p95 (ms) | 38.880 | 0.337 | 0.308 |
| 미일치 검색 p95 (ms) | 35.615 | 0.273 | 0.206 |
| 흔한 단어 검색 p95 (ms) | 0.139 | 0.092 | 0.093 |
| 1,000행 insert+commit p50 (ms) | 8.739 | 27.520 | 147.369 |
| 1,000행 insert+commit p95 (ms) | 12.647 | 42.730 | 204.371 |
| 초기 테이블+인덱스 공간 (MiB) | 33.59 | 46.48 | 46.48 |
| 1,000행 평균 WAL (bytes) | 612,320 | 3,083,602 | 15,423,702 |

희귀어와 한글 긴 검색어에서는 실제 GIN을 사용했다. 흔한 단어·짧은 검색은 GIN을 선택하지 않았으며, 두 글자 한글 `임무`는 여전히 수십 ms였다. 추출 가능한 trigram이 없는 LIKE 패턴은 전체 인덱스 스캔으로 퇴화할 수 있다. GIN fastupdate는 pending list로 쓰기를 지연하지만 정리 비용이 없어지는 것은 아니다. 이번 on 설정의 수동 잔여 pending 정리는 약 6.9ms였고 자동 정리가 일어난 경우 그 비용은 insert 시간에 포함된다. 근거: [PostgreSQL 16 pg_trgm](https://www.postgresql.org/docs/16/pgtrgm.html), [GIN fast-update 구현](https://www.postgresql.org/docs/16/gin-implementation.html).

이 시험은 warm-cache 합성 fixture이며 쓰기에는 현재 검색용 B-tree와 후보 GIN을 포함하지만 전체 운영 audit hash/lock/FK/모든 인덱스 및 네트워크 비용은 포함하지 않는다. WAL은 단독 시험 클러스터 전체 증가량이다. 최초 예비 시험의 초기 flush 편향은 보존하고 최종 측정은 모든 변형에 같은 warmup을 적용했다. 실제 운영 검색 빈도, 동시 송출·감사 저장 p95 예산, generic prepared plan, 분포 편향, 1천만/1억행, 장시간 pending 정리·lock wait는 아직 미검증이다. 따라서 검색만 빨라진다는 이유로 쓰기 중앙값 약 3배/17배 및 추가 공간 약 38%의 인덱스를 자동 채택하지 않는다. 별도 요구/부하 evidence가 생기면 최소 표현식 후보와 재평가한다.

재현은 전용 로컬 `gcs_query_benchmark` DB의 새 `event_search_*` namespace에서만 허용한다. 기존 namespace가 하나라도 있으면 DDL 전에 실패하고 삭제/덮어쓰기를 하지 않는다. 실제 재실행 거부 뒤 각 변형의 110,000행 보존도 확인했다. `--run` 없는 실행은 접속 없이 NOT_RUN이며, 실패는 원문 SQL/검색어/호스트 없는 FAIL 코드와 nonzero exit다. CI는 PostgreSQL fixture에서 3회 측정하고 `event-search-index-benchmark` artifact를 저장한다. PASS는 결과·범위·측정 계약 통과이지 성능 목표 또는 운영 배포 승인이라는 뜻이 아니다.

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
