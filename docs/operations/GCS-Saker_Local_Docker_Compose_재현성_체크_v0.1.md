# GCS-Saker Local Docker Compose 재현성 체크 v0.1

## 목적

로컬 Mac, Server-02 staging, Server-01 production 후보에서 같은 compose 구조를 재현 가능하게 유지한다.

## 사전 체크

```bash
cd gcs-dashboard
test -f mediamtx.yml
docker compose config
```

`mediamtx.yml`이 디렉터리이면 MediaMTX bind mount가 실패하고, nginx는 `mediamtx` upstream을 해석하지 못해 restart loop에 들어갈 수 있다.

## 환경 분리

- local: `gcs-dashboard/.env`
- backend local override: `backend/.env`
- staging/prod: 서버별 `.env`를 Git 외부에 보관
- secret: GitHub와 PR에 기록하지 않는다.

## 주요 포트

| Service | Port | 목적 |
| --- | --- | --- |
| dashboard/nginx | 3000 | 로컬 dashboard |
| backend | 8001 | FastAPI health/readiness/API |
| MediaMTX WebRTC/WHEP | 8889 | WebRTC playback/publish |
| MediaMTX HLS | 8888 | HLS fallback |
| MediaMTX ICE | 8189/udp,tcp | WebRTC ICE |
| RTSP/SRT/RTMP | 8554/8890/1935 | 장비 ingest 후보 |

## 복구 순서

1. Docker daemon 상태를 확인한다.
2. `gcs-dashboard/mediamtx.yml`이 파일인지 확인한다.
3. `docker compose config`로 env/compose 문법을 확인한다.
4. MediaMTX를 먼저 확인한다.
5. backend `/healthz`, `/readyz`를 확인한다.
6. dashboard 접속과 `/api/v1/streams` playback URL을 확인한다.

## 일회성 내부 PKI smoke

로컬 통합 시험은 저장소의 placeholder 인증서를 TLS 성공 근거로 사용하지 않는다. 다음 명령은 저장소 외부에
일회성 CA와 leaf 인증서를 만들고, 런타임에는 CA 개인키를 제외한 인증서만 별도 Docker volume으로 전달한다.

```bash
START_STACK=1 STOP_STACK=1 BUILD_STACK=0 EPHEMERAL_INTERNAL_PKI=1 \
  bash scripts/smoke/m7_single_node_runtime_smoke.sh --run
```

- auth-policy 키는 UID `10002`, media-control/backend 키는 UID `10001`, MQTT 키는 UID `1883`만 읽는다.
- one-shot CA는 영속 감사 앵커 키와 연속성이 없으므로 이 smoke에서만 앵커 스케줄러를 비활성화한다.
- 성공과 실패 모두 서비스 로그 tail을 보존한 뒤 컨테이너, 임시 PKI volume, 호스트 임시 키를 정리한다.
- 영속 PKI 회전과 감사 앵커 무결성은 별도 운영 qualification에서 계속 fail-closed로 검증한다.

## #112 반영 사항

- `mediamtx.yml` file bind mount를 테스트로 확인한다.
- webcam publisher용 `VITE_LOCAL_WEBCAM_WHIP_URL`을 Docker build arg로 포함한다.
- compose 구조와 운영 체크 순서를 문서화한다.
