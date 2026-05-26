# GCS-Saker 운영장애대응 Runbook v0.1

작성일: 2026-05-26 KST

## 목적

이 문서는 M2 배포 전에 GCS-Saker 운영자가 장애를 감지하고, 사용자 영향을 줄이며, 복구와 rollback 여부를 판단하기 위한 초안 Runbook이다. 상세 접속 정보, 내부 IP, secret, 원시 보안 로그는 공개 저장소에 기록하지 않는다.

## 운영 원칙

| 원칙 | 기준 |
| --- | --- |
| 안전 우선 | SSH, UFW, Docker, Nginx, MediaMTX, DB 변경은 사용자 고지 후 서버별로 순차 수행한다. |
| 스트림 우선 | AI, telemetry, command 기능이 실패해도 원본 stream 재생은 가능한 한 유지한다. |
| 상태 노출 | 정상처럼 숨기지 않고 `degraded`, `reconnecting`, `fallback`, `stale`, `error` 상태를 UI에 표시한다. |
| 최소 노출 | 외부 공개는 HTTPS/WSS/reverse proxy 중심으로 정리하고 관리 포트와 DB는 외부 노출을 줄인다. |
| 복구 가능성 | 배포, 설정 변경, Docker compose 변경 전에는 rollback 기준과 이전 artifact를 확인한다. |

## M2 배포 전 선행 조건

| 선행 조건 | 이유 | 관련 이슈 |
| --- | --- | --- |
| 서버 기준선 점검과 백업 완료 | 장애 발생 시 정상 상태와 rollback 기준을 알아야 한다. | #25, #26 |
| SSH/UFW/fail2ban/auditd 기준 적용 | 장애 대응 중 서버 접근과 침입 방어가 동시에 필요하다. | #105, #107, #108, #109 |
| health/readiness 기준 정의 | Docker, Nginx, 운영자가 같은 기준으로 장애를 판단해야 한다. | #100 |
| env/secret 분리 | 장애 대응 중 잘못된 `.env` 주입으로 장애가 재발하지 않게 한다. | #31 |
| reverse proxy/포트/DNS 정책 정리 | HTTPS/WSS/WebRTC/HLS 경로 장애를 분리해서 볼 수 있어야 한다. | #28, #29, #30 |
| dashboard 상태 표시 모델 | 사용자에게 재연결, fallback, 지연, 장애 상태를 명확히 보여줘야 한다. | #33, #34, #101 |
| mini failure smoke test | 실제 배포 전 작은 장애를 자동 또는 반자동으로 재현해야 한다. | #102 |

## 1차 장애 분류

| 장애 유형 | 감지 신호 | 완화 | 복구 | 사용자 표시 | 관련 검증 |
| --- | --- | --- | --- | --- | --- |
| Backend API 장애 | `/health` 또는 `/ready` 실패, API timeout 증가 | dashboard cached state 유지, exponential backoff 적용 | backend container restart, 이전 image rollback 판단 | `서버 연결 불안정`, `재연결 중` | #100, #102 |
| MediaMTX 장애 | WHEP/HLS playback URL 실패, stream session 0 | HLS fallback 또는 stream card error 격리 | MediaMTX restart, publisher 재연결, 설정 rollback | `스트림 재연결 중`, `대체 재생 사용 중` | #100, #101, #102 |
| WebRTC ICE 실패 | ICE `failed`/`disconnected`, 첫 프레임 timeout | HLS fallback, TURN 후보 사용 | ICE server 설정 확인, TURN credential 교체 | `WebRTC 연결 실패`, `HLS fallback` | #60, #101, M5 TURN 검증 |
| HLS 지연 증가 | 첫 프레임 지연, buffer/freeze 증가 | selected stream 우선, 낮은 품질 stream 사용 | encoder/MediaMTX 튜닝, 부하 분산 | `지연 증가`, `품질 저하` | #101, M5 부하 테스트 |
| Telemetry WSS 끊김 | heartbeat timeout, 최근 telemetry TTL 만료 | latest cache 표시, 재연결 backoff | WSS endpoint, broker, Redis latest cache 확인 | `상태 정보 지연`, `telemetry stale` | M3 telemetry 이슈 |
| AI endpoint timeout | AI request timeout, result freshness 만료 | 원본 stream 유지, AI overlay만 degraded 처리 | AI adapter retry, processor disable, endpoint rollback | `AI 분석 지연`, `원본 영상 유지` | M4/M5 AI 이슈 |
| Command ack timeout | command pending 만료, ack 미수신 | 명령 상태를 failed/timeout으로 고정 | MQTT broker/device 상태 확인, 재전송 정책 판단 | `명령 실패`, `응답 시간 초과` | M4 command 이슈 |
| Auth 장애 | login/token refresh 실패, 401/403 증가 | 기존 세션 만료 전 경고, 권한 없는 제어 차단 | auth 설정 rollback, key/secret 확인 | `인증 필요`, `권한 없음` | #32 |
| Dashboard frontend 장애 | JS runtime error, player component crash | error boundary, stream card 단위 retry | build rollback, cache invalidation | `패널 오류`, `다시 시도` | #33, #34, #102 |
| 서버 전체 장애 | SSH/HTTP/health 모두 실패, 외부 연결 불가 | 다른 서버 또는 이전 image 기준 rollback 준비 | 서버 재시작, Docker compose 복구, 백업 기준 복원 | `서비스 점검 중`, `복구 중` | #27, #35, M5 복구 리허설 |

## 즉시 대응 절차

### 1. 사용자 영향 범위 확인

| 확인 | 명령 예시 | 판정 |
| --- | --- | --- |
| 서버 접속 가능 여부 | `ssh <server-alias>` | 접속 실패면 네트워크, SSH, 서버 전원, UFW 순서로 본다. |
| 공개 경로 응답 | `curl -fsS <public-health-url>` | 실패 시 Nginx/proxy/backend를 분리해서 확인한다. |
| backend 상태 | `curl -fsS <backend-health-url>` | health 실패는 container log와 DB 연결을 확인한다. |
| MediaMTX 상태 | `curl -fsS <media-health-url>` | stream publish/playback 경로를 확인한다. |
| Docker 상태 | `sudo docker ps --format '<name> <status>'` | restart loop 또는 exited container를 찾는다. |

### 2. 서버 내부 상태 확인

```bash
uptime
df -h
free -h
sudo systemctl status ssh --no-pager
sudo systemctl status ufw --no-pager
sudo systemctl status fail2ban --no-pager
sudo systemctl status auditd --no-pager
sudo docker ps
sudo docker compose ps
```

주의: 공개 이슈에는 위 명령의 원시 결과를 그대로 붙이지 않는다. `pass`, `warn`, `action-needed` 수준으로 요약한다.

### 3. 로그 확인

```bash
sudo journalctl -u ssh --since "30 minutes ago" --no-pager
sudo journalctl -u ufw --since "30 minutes ago" --no-pager
sudo journalctl -u fail2ban --since "30 minutes ago" --no-pager
sudo docker logs --tail 200 <service-name>
```

로그에 secret, token, 내부 IP, 사용자 식별 정보가 포함될 수 있으므로 GitHub에는 sanitized summary만 남긴다.

## 장애별 복구 판단

| 상황 | 1차 조치 | rollback 판단 |
| --- | --- | --- |
| health만 실패하고 container는 살아 있음 | app log, DB 연결, env 주입 확인 | 새 배포 직후 발생했고 env/config가 원인이면 rollback 후보 |
| container restart loop | 최근 image/config 변경 확인, 이전 config와 비교 | 2회 이상 재시작해도 동일하면 이전 image rollback |
| WebRTC만 실패하고 HLS는 정상 | ICE/TURN/HTTPS mixed content 확인 | proxy/ICE 설정 변경 직후면 해당 설정 rollback |
| HLS도 WebRTC도 실패 | MediaMTX, publisher, network path 확인 | MediaMTX 설정 변경 직후면 이전 설정 rollback |
| telemetry만 stale | WSS, broker, Redis/latest cache 확인 | stream이 정상이라면 전체 rollback보다 telemetry 격리 |
| AI만 timeout | AI adapter timeout과 endpoint 상태 확인 | 원본 stream 정상 유지, AI endpoint만 rollback/disable |
| command ack timeout | MQTT/device ack path 확인 | 안전상 재전송보다 timeout 표시와 운영자 확인 우선 |
| 서버 SSH 불가 | 별도 서버/콘솔/라우터 상태 확인 | 방화벽/SSH 변경 직후면 이전 UFW/sshd config 복원 |

## 사용자 표시 문구 기준

| 내부 상태 | 사용자 표시 | UI 동작 |
| --- | --- | --- |
| `healthy` | `정상` | 녹색 상태, 실시간 값 표시 |
| `degraded` | `일부 기능 지연` | 원본 stream 유지, 영향 기능 badge 표시 |
| `reconnecting` | `재연결 중` | spinner 또는 progress, 자동 retry |
| `fallback` | `대체 재생 사용 중` | HLS fallback 또는 낮은 품질 stream 표시 |
| `stale` | `최근 상태 아님` | 마지막 업데이트 시각을 함께 표시 |
| `error` | `연결 실패` | retry 버튼과 원인 범주 표시 |
| `maintenance` | `점검 중` | 배포/복구 중 상태 표시 |

## M2~M5 연결표

| 단계 | 목표 | Runbook에서 이어질 항목 |
| --- | --- | --- |
| M2 | 서버 배포 전 운영 기준선과 최소 smoke | #100 health 기준, #101 reconnect/fallback, #102 failure smoke |
| M3 | telemetry freshness와 alert | stale data, heartbeat timeout, alert severity |
| M4 | AI와 command 장애 격리 | AI timeout, command ack timeout, 권한 실패 처리 |
| M5 | 부하/저지연/복구 리허설 | 5대/16대 stream, TURN 사용률, 서버 장애 복구, rollback 검증 |

## 산출물 파일 이름 규칙

운영 산출물은 `[프로젝트명]_[산출물명]_[버전 또는 날짜].md` 형식을 사용한다.

| 산출물 | 파일명 예시 |
| --- | --- |
| 운영 장애 대응 Runbook | `GCS-Saker_운영장애대응_Runbook_v0.1.md` |
| 서버 장애 복구 리허설 보고서 | `GCS-Saker_서버장애복구_리허설보고서_2026-05-26.md` |
| 스트리밍 부하 테스트 보고서 | `GCS-Saker_5대Stream_부하테스트보고서_v0.1.md` |
| AI 장애 테스트 보고서 | `GCS-Saker_AIEndpoint_장애테스트보고서_v0.1.md` |
| Backup rollback 리허설 보고서 | `GCS-Saker_BackupRollback_리허설보고서_v0.1.md` |

## 공개 보고 템플릿

```markdown
## 장애 대응 보고

- 발생 시각:
- 영향 범위:
- 감지 신호:
- 사용자 표시:
- 즉시 조치:
- 복구 결과:
- 재발 방지:
- 후속 이슈:
```

## 현재 한계와 후속 작업

| 한계 | 후속 작업 |
| --- | --- |
| health/readiness endpoint 기준이 아직 확정되지 않았다. | #100에서 backend/MediaMTX 기준을 코드와 문서로 확정한다. |
| reconnect/backoff/fallback 정책이 UI와 player에 완전히 반영되지 않았다. | #101에서 WebRTC/HLS 상태 모델을 구현한다. |
| 장애 smoke가 아직 자동화되어 있지 않다. | #102에서 최소 3개 실패 시나리오를 test/script로 만든다. |
| 로컬/휴대폰 카메라 WebRTC 테스트 하네스가 아직 없다. | #103에서 실제 입력 stream 검증 경로를 만든다. |
| Docker publish port와 UFW의 관계가 완전히 정리되지 않았다. | #28~#31에서 reverse proxy, env, compose bind 정책과 함께 정리한다. |
