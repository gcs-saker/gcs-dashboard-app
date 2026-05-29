# GCS-Saker Nginx HTTPS/WSS reverse proxy v0.1

작성일: 2026-05-26 KST

## 목표

M2 Server-02 staging 배포 전에 Nginx reverse proxy의 HTTPS, WSS, API, dashboard, media endpoint 정책을 먼저 고정한다. 실제 인증서 설치와 서버 적용은 M2 후반 staging 배포 이슈에서 수행한다.

## 설정 파일

초안 설정은 `deploy/nginx/gcs-saker.reverse-proxy.example.conf`에 둔다. 이 파일은 운영 서버에 그대로 복사하기 전, 서버 이름과 인증서 경로를 실제 환경에 맞게 조정해야 한다.

## Endpoint 정책

| 공개 경로 | upstream | 목적 | 정책 |
| --- | --- | --- | --- |
| `http://<host>/` | Nginx | HTTPS redirect | ACME challenge를 제외하고 `https://$host$request_uri`로 redirect |
| `https://<host>/` | `nginx:3000` | Dashboard serving | SPA/dashboard entrypoint |
| `https://<host>/healthz`, `https://<host>/readyz` | `backend:8001` | Liveness/readiness smoke | backend root health endpoint로 직접 proxy |
| `https://<host>/api/healthz`, `https://<host>/api/readyz` | `backend:8001` | API namespace smoke | 운영 점검에서 API 단일 prefix를 사용할 때도 backend health endpoint로 proxy |
| `https://<host>/api/` | `backend:8001` | Backend API proxy | `/api/v1/*` 중심으로 proxy, 추후 legacy `/control`, `/telemetry` 경로는 API migration 이슈에서 정리 |
| `wss://<host>/ws/` | `backend:8001` | Backend WebSocket | `Upgrade`, `Connection` header를 반드시 전달 |
| `https://<host>/hls/<stream>/index.m3u8` | `mediamtx:8888` | HLS fallback playback | `/hls/` prefix 제거 후 MediaMTX로 전달, buffering/cache off |
| `https://<host>/webrtc/<stream>/whep` | `mediamtx:8889` | WebRTC/WHEP playback | `/webrtc/` prefix 제거 후 MediaMTX로 전달, long read timeout |

## WebRTC/HLS/TURN proxy 판단

- WebRTC WHEP signaling은 HTTPS reverse proxy 경유가 가능하다.
- WebRTC ICE UDP/TCP media port는 일반 HTTP reverse proxy 대상이 아니다. 필요한 port는 방화벽/Docker publish 정책에서 별도 허용한다.
- HLS는 HTTP 기반 fallback이므로 `/hls/` reverse proxy 대상으로 둔다.
- STUN/TURN 서버는 Nginx가 proxy하지 않는다. TURN credential은 `.env` 또는 서버 secret 저장소로만 주입한다.
- MediaMTX API `9997`과 metrics `9998`은 외부 공개 경로를 만들지 않는다.

## 보안 정책

- HTTP는 HTTPS로 redirect한다.
- WSS는 `/ws/` 경로에서 WebSocket upgrade header를 전달한다.
- 관리 포트와 metrics 포트는 Nginx location과 Docker publish 정책 양쪽에서 외부 노출하지 않는다.
- TLS 인증서 경로는 예시값이며 실제 서버에서는 Certbot 또는 운영 인증서 경로로 교체한다.
- 서버 적용 전 `nginx -t`, `docker compose config`, backend test, frontend build를 모두 통과시킨다.

## 로컬 검증 기준

이번 이슈에서는 실제 서버 적용 대신 다음 계약을 테스트로 검증한다.

- reverse proxy 설정 초안 파일 존재
- HTTP to HTTPS redirect 존재
- HTTPS server와 certificate placeholder 존재
- `/healthz`, `/readyz`, `/api/healthz`, `/api/readyz`, `/api/`, `/ws/`, `/hls/`, `/webrtc/` location 존재
- WebSocket upgrade header 존재
- `9997`, `9998` 관리 포트 미노출

## 후속 작업

- Server-02 staging 배포 시 실제 domain, certificate, firewall rule과 연결한다.
- Backend에 WebSocket API가 추가되면 `/ws/` upstream health와 integration test를 추가한다.
- 휴대폰 카메라 WebRTC smoke test에서는 public HTTPS origin과 ICE 후보 수집 결과를 함께 확인한다.
