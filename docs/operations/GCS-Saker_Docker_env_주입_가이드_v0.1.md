# GCS-Saker Docker env 주입 가이드 v0.1

작성일: 2026-05-26 KST

## 목적

M2 배포 전 local, staging, production 환경에서 Docker Compose와 애플리케이션 설정을 같은 방식으로 주입하기 위한 기준이다. 실제 secret은 GitHub에 저장하지 않는다.

## env 파일 역할

| 파일 | 용도 | GitHub 기록 여부 |
| --- | --- | --- |
| `gcs-dashboard/.env.example` | 로컬 compose 실행 예시 | 가능 |
| `gcs-dashboard/.env.staging.example` | staging 서버 env 템플릿 | 가능 |
| `gcs-dashboard/.env.production.example` | production 후보 env 템플릿 | 가능 |
| `gcs-dashboard/.env` | 로컬 실제 실행값 | 금지 |
| `backend/.env.example` | backend 단독 실행 예시 | 가능 |
| `backend/.env` | backend 실제 실행값 | 금지 |

`.env`, `.env.staging`, `.env.production` 같은 실제 파일에는 DB 비밀번호, TURN credential, 운영 도메인 세부값이 들어갈 수 있으므로 commit하지 않는다.

## Docker Compose 주입 구조

`gcs-dashboard/docker-compose.yml`은 `env_file` 설정으로 다음 경로의 env 파일을 선택적으로 읽는다.

```bash
gcs-dashboard/.env
backend/.env
```

로컬에서 처음 실행할 때는 예시 파일을 복사한 뒤 값을 로컬용으로 바꾼다.

```bash
cp gcs-dashboard/.env.example gcs-dashboard/.env
cp backend/.env.example backend/.env
```

staging/production에서는 같은 키 이름을 유지하되, 값은 서버 secret 관리 위치에서 주입한다.

## 필수 env 그룹

| 그룹 | 주요 변수 | 설명 |
| --- | --- | --- |
| database | `MYSQL_*`, `DATABASE_URL` | MySQL container와 backend DB 연결 |
| backend | `BACKEND_HTTP_PORT`, `BACKEND_IMAGE` | API service port/image |
| mqtt | `MQTT_*` | control message broker |
| dashboard | `DASHBOARD_HTTP_PORT`, `VITE_*` | nginx serving과 Vite build-time 값 |
| mediamtx | `MEDIAMTX_*` | playback/ingest port, public playback URL |
| edge | `PUBLIC_HTTPS_PORT`, `NGINX_CERTS_DIR` | 외부 `443/tcp` 단일 인입과 TLS 인증서 경로 |
| ice | `MEDIAMTX_ICE_BIND_ADDR`, `TURN_PUBLIC_BIND_ADDR`, `TURN_*` | 외부/NAT 환경 WebRTC ICE/TURN 설정 |

## 443 단일 인입 기준

M2 Server-01 production 후보에서는 `edge` Nginx container가 외부 `443/tcp`를 받는다. dashboard `3000`, backend `8001`, MediaMTX `8888/8889` 같은 직접 서비스 포트는 기본적으로 `LOCAL_BIND_ADDR=127.0.0.1`에만 바인딩한다.

자체서명 인증서는 서버 private 경로에 생성하고 `NGINX_CERTS_DIR`로 주입한다. 이 디렉터리에는 `fullchain.pem`, `privkey.pem` 두 파일이 있어야 하며, 실제 key는 GitHub에 기록하지 않는다.

`8189/udp`, `8189/tcp`는 WebRTC ICE media 후보 검증이 실패한 뒤에만 `MEDIAMTX_ICE_BIND_ADDR=0.0.0.0`과 공유기 포트포워딩을 함께 적용한다. TURN은 `TURN_PUBLIC_BIND_ADDR=0.0.0.0`으로 `3478/tcp`, `3478/udp`, `49160-49200/udp`만 공개한다. RTSP/RTMP/SRT/HLS/signaling 관리 포트는 계속 `LOCAL_BIND_ADDR=127.0.0.1` 또는 Nginx reverse proxy 뒤에 둔다.

## 검증 명령

### 정적 env 계약 확인

```bash
python scripts/docker_env_check.py
```

### compose 해석 확인

```bash
cd gcs-dashboard
docker compose --env-file .env.example config
```

### 로컬 실행

```bash
cd gcs-dashboard
docker compose --env-file .env up --build
```

## 장애 사례와 판정

| 증상 | 원인 후보 | 확인 위치 |
| --- | --- | --- |
| `docker ps`가 daemon에 연결되지 않음 | Docker Desktop/daemon down | `docker desktop status` |
| MediaMTX `Exited (127)` | `mediamtx.yml` bind mount 대상이 파일이 아님 | `ls -la gcs-dashboard/mediamtx.yml` |
| nginx가 restart loop | `mediamtx` upstream DNS 해석 실패 | `docker logs <dashboard>` |
| edge가 TLS 파일을 못 읽음 | `NGINX_CERTS_DIR` 누락 또는 `fullchain.pem`, `privkey.pem` 없음 | `docker compose logs edge` |
| backend DB 실패 | `DATABASE_URL`, MySQL health, 계정/비밀번호 불일치 | backend log, `/readyz` |
| WebRTC는 실패하고 HLS만 가능 | STUN/TURN/NAT/port policy 문제 | #28, #29, #30, #103 |

## #112 반영 기준

로컬 복구 중 확인한 `mediamtx.yml` 디렉터리 생성 문제는 compose/env 재현성 문제로 관리한다. bind mount 대상은 반드시 파일이어야 하며, `scripts/docker_env_check.py`에서 이를 확인한다.
