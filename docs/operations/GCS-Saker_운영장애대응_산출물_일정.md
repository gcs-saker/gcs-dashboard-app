# GCS-Saker 운영장애대응 산출물 일정

작성일: 2026-05-26 KST

상태 갱신일: 2026-07-24 KST

> 이 문서의 M2~M5 배치는 최초 계획이다. 실제로 M7 active runtime cutover는 2026-06-26에 완료됐고, M10 계약/경계 기준선은 2026-07-06에 tag 됐다. 남은 M5 항목은 과거 마일스톤 작업이 아니라 `운영 검증 및 v1.0.0 출고 게이트`로 추적한다.

## 목적

이 문서는 GCS-Saker 프로젝트에서 서버 장애, 스트리밍 장애, 네트워크 장애, AI endpoint 장애가 발생했을 때 어떤 마일스톤에서 대응책을 만들고 검증해야 하는지 정리한다. 운영 관점의 핵심 목표는 평상시 정상 동작뿐 아니라 장애 상황에서도 사용자가 가능한 한 끊김을 덜 느끼도록 감지, 우회, 복구, 안내 체계를 갖추는 것이다.

## GitHub 이슈 기준 현재 배치

| 영역 | 현재 위치 | 관련 이슈 | 현재 판단 |
| --- | --- | --- | --- |
| 서버 현황/배포 준비 | M2 | #25, #27, #35 | 운영 투입 전 서버 기준선을 잡는 단계다. 장애 대응의 출발점이다. |
| 백업/rollback 기초 | M2 | #26, #35 | rollback 가능성은 M2부터 다루지만, 실제 리허설은 M5에 있다. |
| HTTPS/WSS/포트/DNS/env | M2 | #28, #29, #30, #31 | WebRTC/WSS 장애의 원인을 줄이는 인프라 기반이다. |
| Dashboard health/status 표시 | M2 | #33, #34 | 사용자에게 degraded/error/fallback 상태를 보여주는 UI 기반이다. |
| Telemetry 끊김 감지/alert | M3 | #41, #42, #45, #46 | 연결 끊김, timeout, link quality low를 감지하는 운영 신호다. |
| AI timeout/degraded 처리 | M4, M5 | #50, #66 | 원본 stream은 유지하고 AI 결과만 degraded로 떨어뜨리는 방향이다. |
| Command ack timeout | M4 | #55, #56, #57, #58 | 제어 명령 실패와 timeout을 명확히 보여줘야 하는 안전 영역이다. |
| 스트리밍 부하/저지연 검증 | M5 | #61, #62, #63, #64 | 대용량 실시간 스트리밍 품질 검증은 M5에 집중되어 있다. |
| 서버/MediaMTX 장애 복구 | M5 | #65 | backend restart, dashboard 재접속, MediaMTX restart 후 stream 재연결 검증이다. |
| Backup/rollback 리허설 | M5 | #67 | 실제 복구 절차를 1회 이상 수행하는 단계다. |
| 운영 매뉴얼/최종 체크리스트 | M5 | #69, #70, #71 | 납품 전 운영자가 따라할 문서와 known issues를 확정한다. |

## 중요한 판단

현재 로드맵은 장애 복구 검증이 M5에 많이 배치되어 있다. 최종 납품 전 검증이라는 관점에서는 맞지만, 운영 리스크를 일찍 낮추려면 M2부터 장애 대응 설계와 최소 runbook 초안을 시작하는 것이 좋다.

2026-07-24 현재 설계·runbook·자동화 smoke의 상당 부분은 이미 main에 있다. 남은 핵심은 문서 작성 자체보다 Server-01/02, 외부 NAT, TURN relay, 5/16 stream, restart/rollback 조건에서 재현 가능한 증거를 남기는 일이다.

권장 조정은 다음과 같다.

| 권장 조정 | 제안 위치 | 이유 |
| --- | --- | --- |
| 운영 장애 대응 설계 초안 작성 | M2 초반 | staging/production 후보 배포 전에 장애 유형, 감지 신호, 담당 액션을 먼저 고정해야 한다. |
| health/readiness/liveness endpoint 기준 정리 | M2 | Docker/Nginx/reverse proxy에서 죽은 서비스를 빠르게 감지해야 한다. |
| dashboard degraded/error/fallback 상태 모델 정의 | M2 | 사용자가 끊김을 장애로만 보지 않고 현재 상태와 우회 경로를 알 수 있어야 한다. |
| stream reconnect/backoff 정책 정의 | M2~M3 | WebRTC/HLS fallback과 재연결 정책은 UI 구현 전에 계약을 정해야 한다. |
| telemetry freshness/timeout 정책 정의 | M3 | 위치/배터리/링크 품질이 오래된 값인지 사용자가 구분해야 한다. |
| AI endpoint 장애 격리 정책 조기 문서화 | M4 초반 | AI 장애가 원본 스트리밍을 막지 않는다는 원칙을 코드와 UI 모두에 반영해야 한다. |
| M5 장애 복구 테스트를 M2/M3 smoke로 축소 선행 | M2~M3 | 전체 리허설은 M5에 하되, backend restart와 dashboard 재접속 정도는 더 빨리 자동화하는 편이 안전하다. |

## 요약 일정

### 2026-07-24 이후 실행 창

| 기간 | 운영 목표 | 관련 이슈 |
| --- | --- | --- |
| 2026-07-24 ~ 2026-08-14 | telemetry freshness, WSS, alert acceptance gap 마감 | #41, #42, #45, #46 |
| 2026-08-17 ~ 2026-08-28 | AI degraded와 command ACK 통합 검증 | #50, #55~#58, #66 |
| 2026-08-31 ~ 2026-09-18 | TURN, 5/16 stream, latency, direct/relay 실측 | #59, #61~#64, #292 |
| 2026-09-07 ~ 2026-09-18 | restart, 장애 복구, backup/rollback 리허설 | #65, #67 |
| 운영 증거 완료 후 | 운영 매뉴얼·납품 checklist·v1.0.0 후보 | #69~#71 |

일정은 실서버와 시험 장비 접근이 가능한 날짜를 기준으로 조정한다. 자동화 코드가 존재한다는 이유만으로 실측·복구 이슈를 완료 처리하지 않는다.

### M2: 운영 기반과 장애 대응 초안

목표는 staging/production 후보 서버를 만들면서 장애 대응의 최소 기준을 정하는 것이다.

주요 작업:

- Server-01/Server-02 상태 점검
- 기존 Saker 서버 백업
- Server-02 staging 배포
- HTTPS/WSS reverse proxy 구성
- 포트포워딩, DNS/DDNS, env/secret 분리
- Dashboard MVP에 server/connection/health status panel 반영
- Multi-stream grid에 online/offline/error/fallback badge 반영

산출물:

- `GCS-Saker 서버기준선 점검표`
- `GCS-Saker 백업목록 및 Rollback 명령서`
- `GCS-Saker Staging 배포검증 보고서`
- `GCS-Saker 네트워크 포트 DNS 정책서`
- `GCS-Saker Env Secret 분리표`
- `GCS-Saker Dashboard 상태표시 UI 기준서`
- `GCS-Saker 운영장애대응 초안 Runbook`

### M3: 감지, 알림, 최신 상태 보존

목표는 장애가 발생했을 때 시스템이 먼저 알아차리고, 오래된 데이터와 끊긴 연결을 사용자에게 표시하는 것이다.

주요 작업:

- Telemetry WSS 연결 끊김 감지
- Redis latest telemetry cache와 TTL
- telemetry timeout, link quality low, battery low alert
- 지도/telemetry 패널에서 상태 표시
- WSS 30초 이상 유지 테스트

산출물:

- `GCS-Saker Telemetry 장애감지 정책서`
- `GCS-Saker Alert Rule 명세서`
- `GCS-Saker WSS 연결유지 테스트 보고서`
- `GCS-Saker Redis 최신상태 복구 기준서`
- `GCS-Saker Dashboard 경보표시 기준서`

### M4: 외부 의존성 장애 격리

목표는 AI endpoint, 권한, 제어 명령 같은 외부/비동기 의존성이 실패해도 원본 스트리밍과 관제 화면이 무너지지 않게 만드는 것이다.

주요 작업:

- AI Adapter timeout 처리
- 원본 stream 유지, AI result만 degraded 표시
- command ack timeout 처리
- 권한 없는 제어 차단
- command status 저장과 UI 표시

산출물:

- `GCS-Saker AI 장애격리 정책서`
- `GCS-Saker AI Timeout Degraded 테스트 보고서`
- `GCS-Saker Command Ack Timeout 명세서`
- `GCS-Saker 제어명령 장애대응 Runbook`
- `GCS-Saker 권한실패 처리 기준서`

### M5: 부하, 저지연, 장애복구 리허설

목표는 납품 전 실제 운영에 가까운 조건에서 성능과 복구력을 검증하는 것이다.

주요 작업:

- TURN 서버 coturn 구성
- 5대 stream 30분 유지 테스트
- 16대 stream 30분 유지 테스트
- GCS 지연 측정
- WebRTC direct vs TURN 사용률 측정
- Server-01 장애 복구 테스트
- AI endpoint 장애 테스트
- Backup/rollback runbook 검증
- 운영 매뉴얼과 최종 납품 체크리스트 작성

산출물:

- `GCS-Saker TURN 운영검증 보고서`
- `GCS-Saker 5대 Stream 부하테스트 보고서`
- `GCS-Saker 16대 Stream 부하테스트 보고서`
- `GCS-Saker 저지연 측정 보고서`
- `GCS-Saker WebRTC TURN 사용률 분석서`
- `GCS-Saker 서버장애 복구 리허설 보고서`
- `GCS-Saker AI Endpoint 장애테스트 보고서`
- `GCS-Saker Backup Rollback 리허설 보고서`
- `GCS-Saker 운영 매뉴얼`
- `GCS-Saker 최종 납품 체크리스트`

## 장애 유형별 대응 계획

| 장애 유형 | 감지 | 우회/완화 | 복구 | 사용자 표시 |
| --- | --- | --- | --- | --- |
| Backend API 장애 | health/readiness 실패, API timeout | dashboard cached state 유지, 재시도 backoff | container restart, rollback | server degraded, API reconnecting |
| MediaMTX 장애 | playback 실패, WHEP/HLS 실패 | HLS fallback, stream reconnect | MediaMTX restart, stream republish | stream error, reconnecting, fallback |
| WebRTC ICE 실패 | ICE failed/disconnected | HLS fallback, TURN relay 사용 | ICE 서버 설정 확인, TURN credential 교체 | WebRTC failed, HLS fallback active |
| HLS 지연 증가 | first frame 지연, buffer/freeze 증가 | selected main stream 우선, substream 낮은 품질 | MediaMTX/encoder 튜닝 | high latency, degraded quality |
| Dashboard frontend 장애 | JS error, player state error | component error boundary, retry button | build rollback, cache invalidation | panel failed, retry |
| Telemetry WSS 끊김 | heartbeat/timeout | latest telemetry TTL 표시 | reconnect, Redis latest snapshot 복구 | telemetry stale, reconnecting |
| AI endpoint timeout | AI request timeout | 원본 stream 유지, AI 결과만 degraded | AI adapter retry, processor disable | AI degraded |
| Command ack timeout | ack 미수신 | command pending 후 failed 처리 | MQTT broker/device 상태 점검 | command failed/timeout |
| 서버 전체 장애 | SSH/health/port 실패 | Server-02 staging 또는 이전 image rollback | runbook 기반 복구 | service unavailable, failover 안내 |

## 산출물 파일 이름 규칙

산출물 파일명은 `[프로젝트명]_[산출물명]_[버전 또는 날짜].md` 형식을 권장한다.

예시:

- `GCS-Saker_운영장애대응_Runbook_v0.1.md`
- `GCS-Saker_서버장애복구_리허설보고서_2026-05-26.md`
- `GCS-Saker_5대Stream_부하테스트보고서_v0.1.md`
- `GCS-Saker_AIEndpoint_장애테스트보고서_v0.1.md`
- `GCS-Saker_BackupRollback_리허설보고서_v0.1.md`

## 지금 바로 추가하면 좋은 이슈 후보

현재 이슈 구조만 보면 장애 복구 검증이 M5에 몰려 있어 M2~M4 동안 운영 대응 체계가 문서상 늦게 보일 수 있다. 아래 이슈를 추가하거나 기존 이슈의 통과 기준에 포함하는 것을 권장한다.

| 후보 이슈 | 권장 마일스톤 | 목적 |
| --- | --- | --- |
| 운영 장애 대응 Runbook 초안 작성 | M2 | 장애 유형, 담당 액션, 확인 명령, rollback 판단 기준을 조기에 만든다. |
| Backend/MediaMTX health endpoint 및 readiness 기준 정리 | M2 | Nginx/Docker/운영자가 같은 기준으로 상태를 판단하게 한다. |
| Streaming reconnect/backoff/fallback 정책 정의 | M2 | WebRTC 실패, HLS fallback, retry 폭주 방지를 명확히 한다. |
| Dashboard error boundary와 사용자 상태 문구 기준 | M2 | 장애를 UI에서 숨기지 않고, 사용자 불편을 줄이는 방향으로 안내한다. |
| M2 mini failure smoke test | M2 | backend restart, playback API 실패, dashboard 재접속을 작은 단위로 먼저 검증한다. |
| M3 telemetry stale data policy | M3 | 오래된 위치/상태 값을 정상 값처럼 보여주지 않도록 한다. |

## 결론

현재 로드맵에는 장애 대응 요소가 존재한다. 다만 본격 복구 테스트와 운영 매뉴얼이 M5에 집중되어 있으므로, M2에서 운영 장애 대응 초안과 health/fallback/reconnect 기준을 먼저 만들고, M3~M4에서 감지와 외부 의존성 격리를 구현한 뒤, M5에서 부하와 복구 리허설로 증명하는 일정이 가장 안전하다.
