# GCS-Saker M2 운영 가이드 v0.1

작성일: 2026-05-27 KST

## 현재 운영 상태

Server-01은 M2 production 후보 서버다. 외부 public entrypoint는 `443/tcp` 하나로 둔다.

접속:

- URL: `https://a4ai.tplinkdns.com/`
- Server-01 LAN IP: `192.168.0.30/24`
- TP-Link D값: `30`
- Gateway: `192.168.0.1`

## 서비스 구성

| 서비스 | 역할 | 외부 공개 |
| --- | --- | --- |
| `edge` | Nginx HTTPS reverse proxy | `443/tcp` |
| `nginx` | dashboard static serving | localhost only |
| `backend` | FastAPI API | localhost only |
| `mediamtx` | WebRTC/HLS/ingest | localhost only, ICE는 조건부 |
| `mysql` | DB | localhost only |
| `mqtt` | control message broker | localhost only |

Backend runtime:

- Python은 `3.12`로 고정한다.
- 기준 파일은 `backend/.python-version`, `backend/pyproject.toml`, `backend/Dockerfile`이다.
- 로컬 기본 Python이 `3.13+`이면 backend 전체 테스트를 실행하지 않고, Python `3.12` 가상환경 또는 Docker backend container에서 실행한다.

## 경로 정책

| Public path | Upstream |
| --- | --- |
| `/` | dashboard |
| `/api/` | backend |
| `/hls/` | MediaMTX HLS |
| `/webrtc/` | MediaMTX WHEP/WHIP signaling |
| `/ws/` | backend WebSocket future path |

## 일상 점검 명령

Server-01에서:

```bash
cd ~/gcs-dashboard/gcs-dashboard
sudo docker compose ps
sudo docker compose logs --tail=80 edge
sudo docker compose logs --tail=80 backend
sudo docker compose logs --tail=80 mediamtx
sudo ufw status numbered
```

외부에서:

```bash
curl -k -I https://a4ai.tplinkdns.com/
curl -k https://a4ai.tplinkdns.com/api/v1/streams
curl -k https://a4ai.tplinkdns.com/hls/nonexistent/index.m3u8
curl -k https://a4ai.tplinkdns.com/webrtc/raw/local/webcam/whep
```

기대:

- `/`: 200
- `/api/v1/streams`: 인증 전 401
- `/hls/nonexistent/index.m3u8`: 404
- `/webrtc/.../whep` GET: 405

## 배포 절차

1. local branch와 PR 기준을 확인한다.
2. backend Python `3.12` 런타임에서 pytest, mypy, frontend test/build를 통과시킨다.
3. Docker compose config/build를 통과시킨다.
4. Server-01 private backup을 남긴다.
5. `.env`와 인증서 private 경로를 확인한다.
6. `sudo docker compose build`
7. `sudo docker compose up -d`
8. health/readiness/external edge를 확인한다.

## 롤백 절차

```bash
cd ~/gcs-dashboard/gcs-dashboard
sudo docker compose ps
sudo docker compose down
sudo cp <backup-dir>/docker-compose.yml ./docker-compose.yml
sudo cp <backup-dir>/gcs-dashboard.env ./.env
sudo docker compose up -d
curl -fsS http://127.0.0.1:8001/healthz
curl -fsS http://127.0.0.1:8001/readyz
```

DB volume을 보존해야 하면 `down -v`를 쓰지 않는다.

## 인증서 운영

현재:

- 자체서명 인증서
- private path: `/opt/gcs-saker/private/nginx-certs`
- GitHub에는 인증서 내용과 private key를 기록하지 않는다.

다음:

- Let's Encrypt 인증서로 교체한다.
- 인증서 자동 갱신 절차를 cron/systemd timer로 구성한다.
- 갱신 후 `edge` reload를 자동화한다.

## 보안 운영

현재 UFW 허용:

- `55121/tcp`: SSH
- `443/tcp`: HTTPS edge

Signalling 접근 원칙:

- WHEP viewer signalling은 로그인한 사용자와 권한 있는 stream에만 허용한다.
- WHIP publisher signalling은 operator 또는 사전 등록된 장비에만 허용한다.
- 로봇/드론은 device ID와 회전 가능한 device token/client credential을 기본으로 쓰고, MAC 주소나 serial은 fingerprint 보조 값으로만 사용한다.
- MAC 주소는 위조 가능하고 L3/NAT 경계를 지나면 서버에서 직접 확인하기 어렵기 때문에 단독 인증 수단으로 쓰지 않는다.
- 장비 토큰은 stream path, 권한, 만료 시간을 포함해야 하며 분실 시 즉시 폐기할 수 있어야 한다.

즉시 강화할 항목:

- backend CORS를 운영 도메인으로 제한
- Nginx rate limit
- scanner/known-bad path 차단
- fail2ban Nginx filter 연동
- access log rotation
- `/metrics` 외부 미노출 확인
- test publisher feature flag 또는 operator 권한 제한

## 장애 분리

| 증상 | 우선 확인 |
| --- | --- |
| dashboard 접속 안 됨 | TP-Link 443, UFW, edge logs |
| 로그인 실패 | backend logs, DB users, JWT secret |
| `/readyz` 실패 | MySQL, streaming registry, playback URL env |
| WHEP 실패 | MediaMTX logs, `/webrtc/` proxy, stream publish 상태 |
| 영상은 안 나오고 HLS만 됨 | ICE candidate, `8189/udp/tcp`, TURN 필요 여부 |
| HLS도 안 됨 | MediaMTX path, publisher 연결, `/hls/` rewrite |

## 운영 판단 기준

- dashboard/API가 살아있어도 영상 first frame이 느리면 운영 성공이 아니다.
- M2 이후에는 `T_first_frame`, `T_glass_to_glass`, `ICE failure rate`, `fallback rate`를 핵심 지표로 봐야 한다.
- 장애 시 전체 dashboard가 죽지 않고 stream card 단위로 degraded/error/fallback 상태를 표시해야 한다.
