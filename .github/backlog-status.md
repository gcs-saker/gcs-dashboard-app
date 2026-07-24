# GCS-Saker Backlog Status

기준일: 2026-07-24 KST

기준 브랜치: `main`

기준 커밋: `9646033`

이 문서는 GitHub의 열린 이슈와 현재 코드, release tag, 운영 검증 문서를 대조한 백로그 기준표다. 마일스톤 번호는 생성 순서가 아니라 작업 영역을 나타내며, 완료 판단은 이슈 번호보다 아래 증거 우선순위를 따른다.

1. release tag와 release note
2. main에 병합된 코드와 자동화 테스트
3. staging/production 운영 검증 문서
4. 설계 문서 또는 PoC

## 상태 정의

| 상태 | 의미 | GitHub 처리 |
| --- | --- | --- |
| 완료 | 수락 기준을 main 코드·테스트 또는 운영 증거로 충족 | 이슈 종료 |
| 종료 검토 | 구현 근거가 충분하지만 이슈 본문의 일부 수락 기준을 최종 확인해야 함 | 짧은 검증 후 종료 |
| 진행 | main에 일부 구현됐으나 수락 기준이 남음 | 열린 상태 유지 |
| 운영 검증 | 코드는 준비됐고 실서버·부하·복구 증거가 필요 | 열린 상태 유지 |
| 계획 | 구현 착수 전이거나 의사결정이 선행돼야 함 | 열린 상태 유지 |
| 관리 | GitHub 설정처럼 코드만으로 완료를 판정할 수 없음 | 관리자 확인 후 종료 |

## 실제 완료 기준선

| 날짜 | 기준선 | 상태와 의미 |
| --- | --- | --- |
| 2026-05-21 | `legacy-saker-before-realtime-2026-05-21` | M0 legacy snapshot 완료 |
| 2026-05-26 | M1 구현 커밋군 | Streaming Core 코드와 release candidate 문서 완료 |
| 2026-05-29 | `v0.2.0` | M2 서버 배포 가능 baseline 완료 |
| 2026-06-04 | `v0.7.0` | M7 active runtime 전환 완료 |
| 2026-06-26 | `v0.7.1` | M7 release cutover evidence gate 완료 |
| 2026-07-06 | `v0.7.2` | M10 계약·런타임 경계 refactor 기준선 |
| 2026-07-21 | `9646033` | 장비 bootstrap/승인 및 WHIP ICE hotfix 반영 |

`v0.3.0`, `v0.4.0`, `v1.0.0`, `v0.6.0` tag는 생성되지 않았다. 따라서 M3~M6은 “마일스톤 번호가 지났다”는 이유로 완료 처리하지 않고, 각 수락 기준과 증거를 개별 판정한다.

## 열린 이슈 감사

### 관리 백로그

| 이슈 | 상태 | 판정 |
| --- | --- | --- |
| #3 GitHub rulesets 적용 확인 | 관리 | repository 설정에서 main 직접 push, PR, squash, tag 보호를 관리자 확인 |
| #4 GitHub Project 생성 | 관리 | Project view와 field 실재 여부를 관리자 확인 |

### M3 Device, Telemetry, Map

| 이슈 | 상태 | 판정 |
| --- | --- | --- |
| #39 Telemetry payload schema | 종료 검토 | Python/protobuf/Kotlin/TS telemetry contract와 계약 테스트 존재 |
| #40 Telemetry ingest API | 종료 검토 | FastAPI ingest, Spring MQTT bridge, persistence 경로와 테스트 존재 |
| #41 Telemetry WSS | 진행 | telemetry 전달 경로는 있으나 명시된 `/ws/v1/telemetry`, 5~10Hz, disconnect 기준을 재검증 |
| #42 Redis latest telemetry cache | 진행 | Redis write buffer/cache는 존재하나 latest snapshot TTL 및 restart 복구 기준 재검증 |
| #43 Map panel | 종료 검토 | public/offline map, marker, focus, popup과 frontend tests 존재 |
| #44 Geofence model/API | 계획 | geofence domain/API 및 이탈 event 구현 근거 부족 |
| #45 Alert rule skeleton | 진행 | 운영 event/alert 표현은 있으나 battery/tilt/timeout/link rule engine 미완료 |
| #46 Telemetry/map 테스트 | 진행 | map/telemetry 단위 테스트는 있으나 WSS 30초와 alert E2E 증거 부족 |
| #285 이벤트 로그 검색/필터/그래프 | 진행 | 운영 event read model은 존재, 통합 검색·그래프·export 조건 미완료 |
| #286 사용자 프로필/개인 설정 | 계획 | server-side profile preference API 필요 |
| #287 스트림 이름/개인 설정 | 진행 | browser preference 기반은 있으나 server-side alias와 우선순위 계약 미완료 |
| #288 운영 데이터 export | 계획 | 권한·마스킹·감사 로그가 포함된 export 경로 필요 |

### M4 AI, Group Permission, Control

| 이슈 | 상태 | 판정 |
| --- | --- | --- |
| #49 AI Processor Registry | 계획 | processor CRUD/status runtime 구현 필요 |
| #50 AI Adapter service | 진행 | AI contract/mock/sidecar 경계는 존재, 실제 endpoint orchestration과 timeout persistence 미완료 |
| #51 AI result overlay | 진행 | metadata protocol과 smoke는 존재, 실시간 video overlay UI 수락 기준 미완료 |
| #52 Group hierarchy DB | 종료 검토 | organization hierarchy repository/migration/test 존재 |
| #53 Group permission API | 종료 검토 | group policy와 hierarchy 조회·권한 테스트 존재, endpoint 수락 기준 최종 확인 필요 |
| #54 Dashboard group selector | 계획 | 접근 가능한 그룹 선택 UI 수락 기준 미완료 |
| #55 Control command API | 종료 검토 | control API/model과 권한·message 경계 존재 |
| #56 MQTT command publish | 종료 검토 | topic, publisher, protobuf/legacy message 경로 존재 |
| #57 Control panel UI | 진행 | media/publisher controls는 존재, patrol/return/emergency/ack UX 수락 기준 미완료 |
| #58 AI/group/control 통합 테스트 | 진행 | 영역별 테스트는 있으나 명시된 통합 시나리오 증거 부족 |
| #289 Recording/VOD archive | 계획 | storage/retention/auth를 포함한 별도 epic으로 유지 |

### M5 운영 검증과 납품

| 이슈 | 상태 | 판정 |
| --- | --- | --- |
| #59 TURN 서버 구성 | 운영 검증 | coturn/ICE profile과 문서는 존재, Server-02 relay 증거 필요 |
| #61 5 stream 부하 | 운영 검증 | 30분 실측 증거 필요 |
| #62 16 stream 부하 | 운영 검증 | grid/main stream 및 자원 사용률 실측 필요 |
| #63 GCS 지연 측정 | 운영 검증 | 동일 조건 10회 이상 실측 필요 |
| #64 direct vs TURN 사용률 | 운영 검증 | ICE 관측 계약은 존재, 현장 비율과 트래픽 산정 필요 |
| #65 Server-01 장애 복구 | 운영 검증 | restart/reconnect 실서버 리허설 필요 |
| #66 AI endpoint 장애 | 진행 | degraded 원칙과 mock은 존재, runtime fault test 필요 |
| #67 Backup/rollback runbook | 운영 검증 | 문서는 존재, 실제 1회 리허설 증거 필요 |
| #69 운영 매뉴얼 | 진행 | 여러 runbook을 설치·배포·로그 확인 기준으로 통합 필요 |
| #70 최종 납품 체크리스트 | 계획 | 운영 검증 완료 후 작성 |
| #71 v1.0.0 후보 | 계획 | #59~#70 완료 후 release candidate 생성 |

### M6, M7 후속

| 이슈 | 상태 | 판정 |
| --- | --- | --- |
| #186 FCM 운영 알림 | 계획 | mobile notification backend 신규 범위 |
| #187 일일 운영 보고 ingest/push | 계획 | #186 이후 구현 |
| #188 mobile session API | 계획 | web cookie와 분리된 token lifecycle 설계 필요 |
| #189 폐쇄망 STUN/TURN profile | 종료 검토 | closed-network env/compose/gate/runbook 존재, 외부 인터넷 차단 상태 smoke 최종 확인 |
| #190 Android stream 계약 | 진행 | device streaming contract는 존재, Android sequence와 integration plan 보강 필요 |
| #191 Server-01/02 책임 분리 | 계획 | topology ADR 결정 필요 |
| #292 TURN 403/IP 후속 | 운영 검증 | 2026-07-21 WHIP/ICE hotfix 이후 외부망 재검증 필요 |

### 제품 확장 백로그

| 이슈군 | 상태 | 처리 원칙 |
| --- | --- | --- |
| #240~#242 조종 UX·권한·media node | 계획 | M3/M4 정리 뒤 product architecture backlog로 유지 |
| #306~#312 Windows Operator Client | 계획 | #308 기술 결정 → #307 shell → #306/#310 capability/smoke → #309/#311/#312 운영·납품 순서 |
| #315 반응형 웹 | 계획 | Windows native client와 분리해 진행 |
| #453~#458 DeepStream/클라이언트 기술 검토 | 계획 | M11 discovery epic으로 유지; #454 benchmark와 ADR 후 구현 여부 결정 |

### 이번 정리에서 종료

| 이슈 | 종료 근거 |
| --- | --- |
| #537 auth-policy 공개 인증 route hotfix | PR #538과 commit `e57cb8f`로 main 반영되어 2026-07-24 `completed` 종료 |

## 실행 일정

아래 날짜는 계약 납기 확정값이 아니라 백로그 운용을 위한 목표 창이다. 실서버 접근이나 하드웨어가 필요한 작업은 증거 확보 시점에 따라 조정한다.

| 기간 | 목표 | 종료 기준 |
| --- | --- | --- |
| 2026-07-24 ~ 2026-07-31 | 백로그/문서 기준선 정리 | #537 종료 완료, 종료 검토 이슈별 acceptance gap 확정 |
| 2026-08-03 ~ 2026-08-14 | M3 foundation 마감 | #39~#46 중 구현 완료 항목 종료, geofence/alert/WSS gap 분리 |
| 2026-08-17 ~ 2026-08-28 | M4 control/group 마감 | #52~#58 권한·command 계약과 통합 테스트 완료 |
| 2026-08-31 ~ 2026-09-18 | M5 운영 검증 1차 | TURN, 5/16 stream, latency, restart/rollback 증거 확보 |
| 2026-09-21 ~ 2026-10-02 | M6/M9 제품 확장 결정 | mobile session/FCM/topology와 responsive scope ADR |
| 2026-10-05 ~ 2026-10-30 | M8/M11 discovery | Windows client와 DeepStream benchmark/Go-No-Go 결정 |
| 운영 검증 완료 후 | v1.0.0 후보 | #59~#71 완료, known issues와 rollback 기준 고정 |

## 주간 운영 규칙

- 월요일: 종료 검토 이슈의 acceptance gap과 담당 범위를 확정한다.
- 구현 PR: 관련 이슈와 검증 명령을 반드시 연결한다.
- 금요일: main 기준 테스트·운영 증거를 확인하고 이슈 상태를 갱신한다.
- 실측이 없는 부하·지연·복구 작업은 코드가 있어도 완료 처리하지 않는다.
- 새 아키텍처 epic은 기존 M3~M5 blocker와 분리하고 Go/No-Go 전에는 production 일정으로 잡지 않는다.
