# GCS-Saker Closed-Network Profile Runbook v0.1

## 목적

GCS-Saker는 공개망과 폐쇄망 모두에서 동작해야 한다. 폐쇄망에서는 외부 DNS, Google STUN, 공개 지도 tile, npm registry 접속을 운영 중에 요구하지 않아야 한다.

## 이번 기준선

- 폐쇄망 프로필 STUN 값은 내부 STUN/TURN VIP 예시인 `stun:10.0.0.10:3478`이다.
- 폐쇄망 profile은 `gcs-dashboard/.env.closed-network.example`에 분리한다.
- 실제 납품 환경에서는 `10.0.0.10` 예시값을 appliance VIP 또는 내부 TURN/STUN 서버 IP로 교체한다.
- 지도는 `TacticalLeafletMap`의 offline renderer를 사용하며 공개 tile provider를 호출하지 않는다.
- dashboard container는 build 단계에서 `npm run build`를 끝내고, runtime은 nginx가 `dist`만 서빙한다.

## network profile 구분

| profile | env template | 사용 조건 | 외부 의존 |
| --- | --- | --- | --- |
| public | `deploy/compose/.env.public-ice.example` | public DNS와 외부 접속자가 있는 운영망 | public STUN/DNS 가능 |
| mixed | `deploy/compose/.env.mixed-network.example` | 관제 서버는 공개망 접근 가능, 현장 장비는 내부망 중심 | 지도/시간은 공개망 가능, 장비 ICE는 내부 STUN/TURN 우선 |
| closed | `deploy/compose/.env.closed-network.example` | 외부 DNS/HTTP/API가 차단된 폐쇄망 | 외부 의존 금지, 내부 STUN/TURN/time/offline map 사용 |

폐쇄망 납품 기준은 `closed` profile이다. `mixed` profile은 공개망과 폐쇄망 사이의 과도기 환경을 분리하기 위한 것이며, 폐쇄망 검증을 대체하지 않는다.

## 정적 검증

인터넷을 끊은 상태에서도 아래 검사는 실행되어야 한다.

```bash
python3 scripts/gates/closed_network_static_check.py
docker compose --env-file deploy/compose/.env.closed-network.example -f deploy/compose/compose.single-node.poc.yml config --quiet
```

확인 항목:

- active config에 `stun:stun.l.google.com:19302` 기본값이 남아있지 않은지
- closed-network env profile에 STUN/TURN/time server 값이 있는지
- closed/mixed/public profile이 명시적으로 분리되어 있는지
- offline map renderer가 public tile provider 문자열을 포함하지 않는지
- dashboard Dockerfile이 runtime npm install 없이 nginx로 build artifact를 서빙하는지
- Docker Compose가 폐쇄망 env profile을 해석할 수 있는지

## 로컬 폐쇄망 모의 절차

1. private `.env`에 `gcs-dashboard/.env.closed-network.example` 값을 복사한다.
2. `WEBRTC_TURN_PASSWORD`, `MYSQL_PASSWORD`, `AUTH_JWT_SECRET`를 실제 secret으로 바꾼다.
3. TURN/STUN host를 같은 LAN에서 접근 가능한 IP 또는 VIP로 바꾼다.
4. 외부 인터넷을 끊거나 firewall에서 외부 DNS/HTTP를 막는다.
5. `python3 scripts/gates/closed_network_static_check.py`를 실행한다.
6. `docker compose --env-file deploy/compose/.env.closed-network.example -f deploy/compose/compose.single-node.poc.yml config --quiet`를 실행한다.
7. Docker image가 이미 준비된 상태에서 compose를 실행한다.
8. dashboard에서 시간 동기화 모드를 `폐쇄망`으로 설정하고 내부 time server를 점검한다.
9. 송출 단말이 `/webrtc/raw/local/webcam/whip`으로 송출하고 dashboard에서 WHEP playback을 확인한다.

## M7 offline runtime packaging 전략

폐쇄망 납품 산출물은 “현장에서 인터넷으로 받아 설치한다”가 아니라 “검증된 bundle을 반입한다”를 기본값으로 둔다. M2 #193에서 시작한 폐쇄망 profile 검증은 M7에서 single-node appliance package로 확장한다.

## M7 폐쇄망 runtime profile 계약

M7부터 폐쇄망 profile은 단순 문서가 아니라 배포 전 검증 대상이다. 운영자가 아래 값을 현장망에 맞게 바꾸면 dashboard, auth-policy, media-control, coturn, time sync가 외부 인터넷 없이 같은 appliance 또는 같은 폐쇄망 대역 안에서 동작해야 한다.

| 영역 | 공개망 기본값 | 폐쇄망 기준 | 운영 판단 |
| --- | --- | --- | --- |
| STUN | Google 또는 public STUN 가능 | 내부 STUN/TURN VIP | 직접 ICE 후보를 먼저 만들기 위해 내부 STUN을 우선한다. |
| TURN | public DNS 가능 | 내부 coturn primary/secondary | direct 실패 시 relay만 사용한다. TURN 후보 수는 기본 1개로 제한한다. |
| 지도 | 공개 tile provider 가능 | offline renderer 또는 내부 tile server | 외부 tile provider 호출이 있으면 폐쇄망 실패로 본다. |
| 시간 동기화 | public NTP 가능 | 내부 NTP/chrony host | 영상/음성/AI overlay timestamp를 맞추기 위한 필수 항목이다. |
| API 진입점 | HTTPS edge | 내부 HTTPS edge | self-signed가 아니라 내부 CA 신뢰 체인을 권장한다. |
| dependency | public registry 가능 | image tarball/cache bundle | 현장 runtime에서 `npm install`, `gradle download`, `docker pull`을 요구하지 않는다. |
| secret | 운영 secret manager 또는 `.env` | 현장 보안 채널 `.env` | GitHub, PR, 문서, 채팅에 실제 secret을 기록하지 않는다. |

필수 환경값은 아래 계약을 따른다. 실제 IP는 예시값을 그대로 쓰지 않고 현장 appliance VIP 또는 내부 DNS로 교체한다.

```env
SAKER_NETWORK_PROFILE=closed
VITE_STREAM_API_BASE_URL=/media-control
VITE_MAP_PROVIDER=offline
VITE_STATIC_ASSET_DELIVERY_MODE=offline-bundle
DASHBOARD_MAP_PROVIDER=offline
WEBRTC_STUN_URL=stun:10.0.0.10:3478
WEBRTC_TURN_URL=turn:10.0.0.10:3478?transport=udp
TIME_SYNC_MODE=closed_network
TIME_SYNC_SOURCE_HOST=10.0.0.10
MEDIA_CONTROL_STUN_URL=stun:10.0.0.10:3478
MEDIA_CONTROL_TURN_PRIMARY_URL=turn:10.0.0.10:3478
MEDIA_CONTROL_TURN_SECONDARY_URL=turn:10.0.0.11:3478
MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS=1
```

배포 전 아래 명령이 통과해야 한다.

```bash
python3 scripts/gates/closed_network_static_check.py
docker compose --env-file deploy/compose/.env.closed-network.example -f deploy/compose/compose.single-node.poc.yml config --quiet
```

첫 번째 명령은 공개 STUN/지도 tile/runtime npm install 의존을 찾는 정적 검사다. 두 번째 명령은 compose 구문과 환경값 주입 계약을 확인한다. 실제 현장 `.env`는 `.env.single-node.example` 또는 `.env.closed-network.example`를 복사해 secret만 별도 보안 채널로 주입한다.

### 반입 산출물

| 산출물 | 예시 | 목적 |
| --- | --- | --- |
| compose bundle | `deploy/compose/*.yml`, `.env.closed-network.example` | 서비스 구동 순서와 환경값 계약 고정 |
| Docker image tarball | `gcs-saker-images-<version>.tar` | 외부 registry 없이 `docker load` |
| image manifest | `images.manifest.txt` | image name/tag/digest 목록 고정 |
| checksum | `SHA256SUMS` | 반입 중 손상/변조 여부 확인 |
| signature | `SHA256SUMS.sig` 또는 내부 서명 파일 | 내부 보안 절차가 요구할 경우 무결성 보증 |
| dependency cache | npm cache, pip wheelhouse, Gradle cache, Go module cache | 현장 rebuild가 필요할 때 registry 접속 제거 |
| runtime install bundle | Docker Engine 또는 containerd/Podman offline package | Docker 미설치 환경 대응 |
| internal CA bundle | 내부 CA root, nginx cert chain 설치 가이드 | 사설 인증서 경고 없이 HTTPS/WSS 운영 |
| operation runbook | 설치, 점검, rollback, backup 문서 | 운영자가 Codex 없이 복구 가능해야 함 |

secret은 산출물에 포함하지 않는다. 현장별 `.env`는 별도 보안 채널로 생성하고, GitHub/문서/PR에는 실제 비밀번호, token, private key를 기록하지 않는다.

### Docker가 이미 설치된 환경

1. `SHA256SUMS`를 검증한다.
2. `docker load -i gcs-saker-images-<version>.tar`를 실행한다.
3. `docker image ls`와 `images.manifest.txt`를 비교한다.
4. 현장 `.env.closed-network`를 작성한다.
5. `docker compose --env-file .env.closed-network -f compose.single-node.poc.yml config --quiet`로 계약을 확인한다.
6. `docker compose ... up -d`로 구동한다.
7. `scripts/gates/closed_network_static_check.py`, runtime smoke, publish/play smoke를 순서대로 실행한다.

이 경로의 장점은 설치 범위가 작고 rollback이 단순하다는 점이다. 단점은 Docker Engine 버전과 compose plugin 버전이 너무 낮으면 compose schema나 healthcheck 동작이 달라질 수 있다는 점이다.

### Docker가 설치되지 않은 환경

Docker 자체가 없으면 `docker load`도 불가능하다. 이 경우 납품 bundle은 아래 중 하나를 포함해야 한다.

1. Docker Engine offline install package
2. containerd + nerdctl offline package
3. Podman + compose 호환 layer
4. 완전 appliance image 또는 OS image

우선순위는 Docker Engine offline install이다. 이유는 현재 compose, healthcheck, image naming, 운영 runbook이 Docker Compose를 기준으로 작성되어 있기 때문이다. 다만 군/공공 폐쇄망에서 Docker 설치가 정책상 제한되면 containerd/Podman 대안을 별도 profile로 검증한다.

Docker 미설치 환경의 절차:

1. OS/CPU architecture를 확인한다.
2. 승인된 offline runtime package를 설치한다.
3. runtime service를 enable/start한다.
4. 내부 registry를 쓸지, tarball `load`를 쓸지 결정한다.
5. image tarball을 반입하고 runtime별 load 명령을 실행한다.
6. compose 호환성을 확인한다.
7. same-node smoke와 rollback 절차를 실행한다.

### 언어별 dependency offline cache

현장에서는 rebuild가 필요하지 않도록 image tarball을 우선 제공한다. 그래도 보안 패치나 현장 수정으로 rebuild가 필요할 수 있으므로 dependency cache를 별도 산출물로 둔다.

| 영역 | offline 산출물 | 검증 |
| --- | --- | --- |
| Frontend/npm | `package-lock.json`, npm cache tar 또는 내부 npm mirror snapshot | `npm ci --offline` 또는 내부 registry only build |
| Backend/Python | `requirements.txt`, wheelhouse | `pip install --no-index --find-links wheelhouse -r requirements.txt` |
| Spring/Gradle | Gradle distribution zip, Maven dependency cache | `./gradlew --offline check` |
| Go/media-control | `go.sum`, module cache 또는 vendor directory | `GONOSUMDB`/`GOPROXY=off go test ./...` |
| Docker images | pinned image tag + digest | `docker image inspect` digest 비교 |

cache는 편의 기능이 아니라 재현성 산출물이다. 공개망에서 성공한 build가 폐쇄망에서 `npm install`, `pip install`, `gradle`, `go mod download`, `docker pull` 때문에 멈추면 납품 실패로 본다.

### 내부 CA와 HTTPS/WSS

폐쇄망에서도 HTTP 평문 운영을 기본값으로 두지 않는다. 자체 CA 또는 기관 내부 CA를 사용해 Nginx edge에 인증서를 올리고, dashboard/API/WSS/WebRTC signaling을 HTTPS/WSS 단일 진입점으로 제공한다.

필수 확인:

- browser/Android 단말이 내부 CA root를 신뢰하는지
- Nginx certificate chain이 누락되지 않았는지
- `Secure`, `HttpOnly`, `SameSite` cookie 정책이 HTTPS profile에서 활성화되는지
- WHEP/WHIP signaling URL이 `https://` 또는 `wss://` 기준으로 내려가는지

### 무결성 및 rollback

폐쇄망 bundle은 반입 전후로 같은 checksum을 가져야 한다.

```bash
sha256sum -c SHA256SUMS
```

rollback은 새 bundle을 지우는 방식이 아니라 이전 image tag와 이전 `.env`/compose snapshot으로 되돌리는 방식이다. 따라서 release마다 아래를 보관한다.

- image tarball
- compose/env template
- DB backup 또는 migration 전 dump
- smoke 결과
- checksum/signature

## 아직 실제 장비에서 확인해야 할 것

- 내부 TURN relay allocation 성공 여부
- 내부 NTP/chrony와 서버 clock drift
- 외부 DNS 차단 상태에서 dashboard 최초 로딩
- 오프라인 Docker image tarball load 절차
- Docker 미설치 환경에서 runtime offline install 절차
- Gradle/npm/pip/Go dependency cache 기반 rebuild 절차
- 내부 CA 기반 HTTPS/WSS 신뢰 체인
- 폐쇄망 tile package가 필요할 경우 MBTiles 또는 내부 tile server 선택
