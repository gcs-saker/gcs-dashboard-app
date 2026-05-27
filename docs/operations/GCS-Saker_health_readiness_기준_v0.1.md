# GCS-Saker health readiness 기준 v0.1

작성일: 2026-05-26 KST

## 목적

이 문서는 M2 배포 전 backend, MediaMTX, Docker, Nginx, 운영자가 같은 기준으로 서비스 상태를 판단하기 위한 health/readiness 기준이다. health endpoint는 민감 정보를 노출하지 않는다.

## Endpoint 역할 분리

| endpoint | 목적 | dependency 확인 | 실패 시 의미 | 공개 정보 |
| --- | --- | --- | --- | --- |
| `/healthz` | backend process liveness | 없음 | 프로세스 또는 ASGI 서버 자체 문제 | `service`, `status`, `checks` |
| `/readyz` | 요청 처리 준비 상태 | DB, stream registry, playback URL builder | 요청 처리에 필요한 의존성 문제 | check 이름과 sanitized reason |
| `/metrics` | Prometheus metric scrape | metric exporter | 성능/관측 지표 수집 문제 | Prometheus text format |

`/metrics`는 health 판단용 JSON API가 아니다. Nginx/Docker/운영 smoke에서는 `/healthz`와 `/readyz`를 기준으로 사용한다.

## Backend 기준

| 항목 | 정상 기준 | 실패 처리 |
| --- | --- | --- |
| liveness | `/healthz`가 HTTP 200, `status=ok`를 반환 | container restart 후보 |
| readiness | `/readyz`가 HTTP 200, `status=ok`를 반환 | 배포 완료 또는 upstream 투입 보류 |
| DB readiness | `SELECT 1` 수준의 query가 성공 | `database readiness query failed`만 표시 |
| streaming registry | registry 상태가 ready | stream API/재생 API 투입 보류 |
| playback URL builder | WebRTC/HLS URL 생성 준비 | dashboard playback 연결 투입 보류 |

응답에는 DB URL, 계정, secret, 내부 IP, raw exception을 포함하지 않는다.

## MediaMTX 기준

MediaMTX 관리 API는 내부 스트림 discovery를 위해 활성화하되 외부 포트로 publish하지 않는다. metrics는 기본적으로 비활성화한다. 따라서 readiness는 다음 순서로 판단한다.

| 단계 | 기준 | 명령 예시 |
| --- | --- | --- |
| process | container가 running 상태 | `sudo docker ps --filter name=mediamtx` |
| listener | HLS/WebRTC/WHEP/ingest port가 listen | `python scripts/health_readiness_check.py --run ...` |
| playback | sample stream publish 후 HLS playlist 또는 WHEP endpoint가 응답 | `scripts/streaming_e2e_smoke.sh --run` |
| backend contract | backend playback API가 WebRTC primary와 HLS fallback URL을 반환 | `/api/v1/streams/{streamId}/playback` |

MediaMTX API/metrics가 필요한 경우에도 외부 publish 없이 내부 네트워크 또는 서버 로컬에서만 확인한다. API 권한은 Docker 내부망 백엔드 접근만 허용하고, metrics/pprof 권한은 API 사용자에 포함하지 않는다.

## Docker 기준

| service | health 기준 | 현재 적용 |
| --- | --- | --- |
| backend | `/healthz` HTTP 200 | backend Dockerfile `HEALTHCHECK` |
| MediaMTX | container running + HLS/WebRTC port reachable + sample playback smoke | 외부 probe script 기준 |
| dashboard/nginx | 정적 파일 응답 + reverse proxy upstream readiness | #28 Nginx reverse proxy 설계에서 확정 |

MediaMTX image 내부에 어떤 shell/network tool이 포함되는지 배포 이미지별 차이가 있을 수 있으므로, M2에서는 container 내부 healthcheck보다 서버 외부 probe script를 기준으로 둔다.

## Nginx upstream 기준

#28에서 Nginx reverse proxy를 구성할 때 다음 기준을 사용한다.

| upstream | readiness 기준 | 장애 시 동작 |
| --- | --- | --- |
| backend API | `/readyz` 200 | API upstream 제외 또는 503/degraded 응답 |
| dashboard static | `index.html` 응답 | dashboard 배포 rollback |
| MediaMTX HLS | HLS port reachable, sample playlist 확인 | stream card fallback/error 표시 |
| MediaMTX WebRTC/WHEP | signaling port reachable | HLS fallback 유도 |

## Staging 배포 전후 확인 명령

### 정적 계약 확인

```bash
python scripts/health_readiness_check.py --check
```

### 실행 중인 서비스 확인

```bash
python scripts/health_readiness_check.py --run \
  --backend-url http://127.0.0.1:8001 \
  --mediamtx-host 127.0.0.1 \
  --mediamtx-hls-port 8888 \
  --mediamtx-webrtc-port 8889
```

### sample playback까지 확인

```bash
scripts/streaming_e2e_smoke.sh --run
```

## 장애 판정

| 상황 | 판정 | 다음 조치 |
| --- | --- | --- |
| `/healthz` 실패 | backend process 장애 | container log 확인 후 restart 또는 rollback |
| `/healthz` 성공, `/readyz` 실패 | 의존성 readiness 장애 | DB/env/stream registry/playback builder 확인 |
| MediaMTX process running, port closed | MediaMTX listener/config 장애 | mediamtx.yml과 compose port 확인 |
| port reachable, playback 실패 | publisher 또는 path 장애 | sample publish, stream path, playback URL 확인 |
| WebRTC만 실패 | ICE/WHEP/NAT 장애 | HLS fallback, STUN/TURN 설정 확인 |

## 후속 이슈 연결

| 이슈 | 연결 내용 |
| --- | --- |
| #28 | Nginx HTTPS/WSS reverse proxy가 `/readyz` 기준을 사용한다. |
| #31 | env/secret 분리 후 DB readiness와 MediaMTX public URL 주입을 안정화한다. |
| #101 | WebRTC 실패 시 reconnect/backoff/fallback UI 상태와 연결한다. |
| #102 | 최소 failure smoke에서 backend down, playback API 실패, MediaMTX 미기동을 재현한다. |
| #27 | Server-02 staging 배포 후 이 문서의 명령으로 배포 검증한다. |
