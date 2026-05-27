# GCS-Saker Server-01 production 후보 배포 결과 v0.2

작성일: 2026-05-27 KST

## 목적

M2 production 후보 서버에서 Docker Compose 기반 GCS-Saker stack을 실제로 올리고, backend, dashboard, MediaMTX, MQTT, MySQL이 함께 실행되는지 확인한다.

## 배포 대상

- 대상: Server-01 production 후보
- OS: Ubuntu 22.04.5 LTS
- 배포 브랜치: `feature/issue-27-server02-staging-deploy`
- Docker image tag:
  - `gcs-saker-backend:m2-production`
  - `gcs-saker-dashboard:m2-production`
  - `bluenviron/mediamtx:1.15.3`

## 실행한 주요 명령

```bash
sudo systemctl enable --now ssh
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker inspect mariadb nginx mediamtx mqtt-broker
docker stop mariadb nginx mediamtx mqtt-broker
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:8001/healthz
curl -fsS http://127.0.0.1:8001/readyz
curl -fsSI http://127.0.0.1:3000/
```

operator 계정 seed, login token, 운영 비밀번호는 서버의 private 경로와 환경 변수로만 처리했고 문서에는 기록하지 않는다.

## 검증 결과

| 항목 | 결과 |
| --- | --- |
| SSH service | enabled, active |
| Docker Compose plugin | v5.1.4 설치 |
| Docker Compose config | 통과 |
| Docker image build | 통과 |
| backend container | `healthy` |
| MySQL container | `healthy` |
| dashboard container | running |
| MediaMTX container | running |
| MQTT container | running |
| `/healthz` | 200 OK |
| `/readyz` | 200 OK |
| dashboard local HTTP | 200 OK |
| dashboard HLS proxy | 404 for nonexistent stream, Nginx upstream error 없음 |
| `/auth/login` | 200 OK |
| `/api/v1/streams` | 200 OK, 4개 stream 반환 |

확인된 stream id:

- `raw.sample.front`
- `raw.sample.thermal`
- `raw.sample.rear`
- `raw.local.webcam`

## 발견한 문제와 수정

### Docker Compose v1 호환성 문제

증상:

- `docker compose` 명령이 없고, legacy `docker-compose 1.29.2`가 `name` 및 object 형태의 `env_file` 구문을 거부했다.

원인:

- 현재 Compose 파일은 Docker Compose v2 스펙을 기준으로 작성되어 있다.
- Server-01에는 Docker Compose plugin이 설치되어 있지 않았다.

수정:

- Docker 공식 apt repository를 등록하고 `docker-compose-plugin`을 설치했다.
- `docker compose version`으로 `Docker Compose version v5.1.4`를 확인했다.

### MediaMTX latest drift

증상:

- MediaMTX container가 restart loop에 들어갔다.
- 로그에는 `json: unknown field "hlsAllowOrigins"`가 표시됐다.

원인:

- Compose 기본값이 `bluenviron/mediamtx:latest`였고, Server-01에서 받은 `v1.15.3`은 `hlsAllowOrigins`, `webrtcAllowOrigins` 복수형 키를 받지 않는다.

수정:

- Compose 기본 image를 `bluenviron/mediamtx:1.15.3`으로 고정했다.
- `mediamtx.yml`의 CORS 키를 `hlsAllowOrigin`, `webrtcAllowOrigin` 단수형으로 변경했다.
- 테스트가 `latest` 사용 금지와 v1.15.3 config key를 확인하도록 추가했다.

### Nginx upstream DNS 시작 순서 문제

증상:

- dashboard container가 restart loop에 들어갔다.
- 로그에는 `host not found in upstream "mediamtx" in /etc/nginx/nginx.conf:23`가 표시됐다.

원인:

- Nginx가 시작 시점에 `proxy_pass http://mediamtx:8888/`의 Docker DNS를 즉시 해석한다.
- MediaMTX가 config 오류로 늦게 뜨거나 재시작 중이면 dashboard까지 함께 실패한다.

수정:

- dashboard Nginx에 Docker embedded DNS resolver `127.0.0.11`을 선언했다.
- `/hls/` location에서 `mediamtx` host를 변수로 두고 요청 시점에 해석하도록 변경했다.
- `/hls/<stream>/index.m3u8` public prefix는 rewrite로 MediaMTX 내부 경로에 맞춰 전달한다.
- 수정 후 dashboard image를 재빌드하고 container를 재생성했다.
- `http://127.0.0.1:3000/hls/nonexistent/index.m3u8`는 MediaMTX까지 전달되어 404를 반환했고, Nginx upstream DNS 오류는 재발하지 않았다.

## 외부 인입 상태

서버 내부 검증은 정상이다. 다만 외부 네트워크에서 다음 요청은 실패했다.

- `http://a4ai.tplinkdns.com:3000/`: connection failed
- `http://a4ai.tplinkdns.com/`: timeout

Server-01의 UFW는 `3000/tcp`를 허용하고 dashboard container도 host `3000`에 publish되어 있으므로, 남은 원인은 TP-Link/NAT 포트포워딩 또는 상위 네트워크 인입 정책으로 분리한다.

`80/tcp`, `443/tcp`, HTTPS/WSS reverse proxy는 아직 production 후보 서버에 실적용하지 않았다. 도메인과 인증서 경로가 확정된 뒤 M2 후반 배포 이슈에서 적용한다.

## 롤백 기준

배포 전 기존 Docker 상태는 Server-01의 private backup 디렉터리에 보관했다.

롤백 절차:

```bash
cd ~/gcs-dashboard/gcs-dashboard
sudo docker compose down
git switch <previous-known-good-branch>
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://127.0.0.1:8001/healthz
```

MySQL production 후보 volume을 보존해야 하는 상황에서는 `down -v`를 사용하지 않는다.

## 남은 작업

- TP-Link/NAT에서 Server-01 dashboard 또는 reverse proxy public entrypoint를 연결한다.
- `443/tcp` 기반 Nginx HTTPS/WSS reverse proxy를 실제 인증서와 함께 적용한다.
- 외부 브라우저에서 dashboard 접속과 WebRTC/HLS playback path를 확인한다.
- public ingress가 완료되면 #35의 남은 통과 기준을 닫는다.
