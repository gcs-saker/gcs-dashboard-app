# GCS-Saker Operational Degraded Behavior Runbook v0.1

## 목적

GCS-Saker는 정상 운영뿐 아니라 Redis, TURN, MediaMTX, 서비스 재시작 상황에서도 dashboard가 멈추지 않고 원인을 구분해 보여야 한다.
이 문서는 M7 운영 안정성 테스트의 장애 주입 순서와 기대 결과를 고정한다.

## 공통 확인

```bash
curl -k https://<edge-domain>/healthz
curl -k https://<edge-domain>/readyz
curl -k https://<edge-domain>/media-control/healthz
curl -k https://<edge-domain>/media-control/readyz
curl -k https://<edge-domain>/media-control/api/v1/streams
```

`/healthz`는 프로세스 liveness이다. `/readyz`는 외부 의존성 준비 상태이다.
프로세스가 살아있어도 MediaMTX 또는 TURN 후보가 준비되지 않으면 `/media-control/readyz`는 `503`과 `degraded`를 반환한다.

## Redis 장애

1. Redis 또는 media-control Redis 주소를 일시적으로 끊는다.
2. MediaMTX는 유지한다.
3. `/media-control/api/v1/streams`를 호출한다.

기대 결과:

- stream list는 Redis cache를 건너뛰고 MediaMTX upstream에서 조회된다.
- Redis 장애가 stream discovery 전체 실패로 번지지 않는다.
- Redis 장애는 성능 저하로 취급하고, stream registry가 살아있으면 사용자 화면은 유지된다.

## MediaMTX 장애

1. MediaMTX API 또는 `MEDIAMTX_API_BASE_URL`을 닫힌 포트로 돌린다.
2. `/media-control/readyz`를 호출한다.

기대 결과:

- HTTP status는 `503`이다.
- payload `status`는 `degraded`이다.
- `stream_registry` check는 `error`이다.
- raw upstream 오류 문자열은 public response에 노출하지 않는다.
- dashboard의 signaling/server status는 `저하`로 표시된다.

## TURN 장애

1. primary/secondary TURN probe가 모두 실패하도록 만든다.
2. `/media-control/readyz`를 호출한다.

기대 결과:

- HTTP status는 `503`이다.
- payload `status`는 `degraded`이다.
- `ice_servers` check는 `error`이다.
- dashboard의 signaling/server status는 `저하`로 표시된다.
- API liveness와 authenticated dashboard access는 유지된다.

## 서비스 재시작

1. backend, auth-policy, media-control, MediaMTX 중 하나를 재시작한다.
2. 1초 간격으로 `/healthz`, `/readyz`, `/media-control/readyz`를 확인한다.
3. dashboard를 새로고침하지 않고 status panel 변화를 관찰한다.

기대 결과:

- 재시작 중에는 `error` 또는 `degraded`가 보일 수 있다.
- 의존성이 복구되면 `online`으로 돌아와야 한다.
- stream card가 영구적으로 stale online 상태에 머무르면 실패로 본다.

## 현재 자동화 범위

- Go media-control unit/integration-style test:
  - `/readyz` ok
  - MediaMTX registry failure degraded
  - no healthy ICE server degraded
  - Redis cache outage falls back to upstream
- React dashboard unit test:
  - `/media-control/readyz` 실패 시 signaling status degraded
  - failure smoke scenario registry

## 아직 수동 확인이 필요한 범위

- 실제 Docker Compose에서 container restart 중 dashboard status recovery 확인
- 실제 TURN 포트 차단 후 외부 NAT 단말에서 ICE 실패와 복구 확인
- 실제 MediaMTX process stop/start 중 첫 프레임 복구 시간 측정
