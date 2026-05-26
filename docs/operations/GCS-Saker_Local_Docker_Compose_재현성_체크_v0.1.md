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

## #112 반영 사항

- `mediamtx.yml` file bind mount를 테스트로 확인한다.
- webcam publisher용 `VITE_LOCAL_WEBCAM_WHIP_URL`을 Docker build arg로 포함한다.
- compose 구조와 운영 체크 순서를 문서화한다.
