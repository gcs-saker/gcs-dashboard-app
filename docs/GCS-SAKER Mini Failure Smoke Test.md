# GCS-SAKER Mini Failure Smoke Test

## 목적

M2 배포 전, 작은 장애가 사용자 화면 전체 장애로 번지지 않는지 확인한다.

## 자동 검증

```bash
cd gcs-dashboard
npm run test:smoke:failure -- --run
npm test -- --run
npm run build
```

백엔드 회귀 검증:

```bash
PYTHONPATH=backend .venv/bin/pytest -q backend/tests
python -m mypy --config-file backend/pyproject.toml backend
```

## 필수 실패 시나리오

| ID | 장애 | 기대 표시 | 격리 기준 |
| --- | --- | --- | --- |
| backend-api-down | backend/API timeout 또는 fetch reject | player error alert | dashboard shell 유지 |
| playback-api-failure | playback API 404/503 | HTTP 상태 포함 error | 영구 오류에서 요청 폭주 없음 |
| mediamtx-down | MediaMTX down 또는 media URL fetch 실패 | reconnecting 후 HLS fallback/error | stream panel 내부에 실패 격리 |
| mock-ai-failure | mock AI endpoint 5xx | AI panel degraded/error | 원본 stream UI는 계속 사용 |

## 브라우저 smoke 절차

1. backend를 실행한다.
2. dashboard를 `VITE_API_BASE_URL=http://127.0.0.1:<backend-port>`로 실행한다.
3. 운영자 계정으로 로그인한다.
4. `/?streamingSmoke=1`로 이동한다.
5. MediaMTX를 띄우지 않은 상태에서는 `mode: hls`와 media fetch error가 stream 영역 안에만 표시되어야 한다.
6. backend 로그에서 `/api/v1/streams/<stream-id>/playback`이 200인지 확인한다.

## Server-02 staging 전 확인

- `.env`에 실제 public WebRTC/HLS base URL이 분리되어 있는지 확인한다.
- MediaMTX가 내려간 상태에서 dashboard shell이 유지되는지 확인한다.
- playback API 404/503이 명확한 사용자 메시지로 보이는지 확인한다.
- mock AI 실패가 stream playback을 막지 않는지 확인한다.
