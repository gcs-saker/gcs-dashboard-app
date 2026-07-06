# Streaming Core v0.1.0 Release Candidate

작성일: 2026-05-26 KST

## 목적

M1의 목표는 WebRTC 기반 스트리밍 코어를 실제 개발 기준으로 닫을 수 있는지 확인하는 것이다. 이 문서는 `v0.1.0` 태그 후보의 기능 범위, 검증 결과, 제한사항, M2 진입 조건을 정리한다.

## M1 이슈 상태

GitHub 이슈 제목 기준으로 확인한 M1 필수 이슈는 #24를 제외하고 모두 closed 상태다. #24는 이 문서와 검증 결과를 포함하는 PR이 병합되면 닫는다.

| Issue | 제목 | 상태 |
| --- | --- | --- |
| #11 | M1-01 기존 Saker 스트리밍 구조 분석 | closed |
| #12 | M1-02 MediaMTX WebRTC 설정 추가 | closed |
| #13 | M1-03 MediaMTX Docker Compose 포트 정리 | closed |
| #60 | M1-04 MediaMTX STUN/TURN ICE 서버 설정 추가 | closed |
| #80 | M1-05 Frontend Jest/RTL coverage gate 구성 | closed |
| #14 | M1-06 Stream path 규칙 정의 | closed |
| #15 | M1-07 Backend streaming module skeleton 생성 | closed |
| #16 | M1-08 Playback URL Builder 구현 | closed |
| #17 | M1-09 Stream Registry seed 구현 | closed |
| #18 | M1-10 Stream API 구현 | closed |
| #19 | M1-11 WebRTCPlayer 구현 | closed |
| #20 | M1-12 HLSFallbackPlayer 구현 | closed |
| #21 | M1-13 RealtimePlayer wrapper 구현 | closed |
| #22 | M1-14 Sample stream publish script 작성 | closed |
| #23 | M1-15 Streaming E2E smoke test 작성 | closed |
| #47 | M1-16 AI endpoint contract 초안 구현 | closed |
| #91 | M1-16 Frontend bundle lazy loading 최적화 | closed |
| #48 | M1-17 Mock AI endpoint skeleton 구현 | closed |
| #85 | M1 긴급 Dependency 취약점 제거 및 정적 검증 게이트 도입 | closed |
| #24 | M1-18 Streaming Core release tag v0.1.0 준비 | release gate |

## v0.1.0 기능 범위

- MediaMTX는 WebRTC/WHEP primary, HLS fallback, RTSP/SRT ingest 포트 기준을 가진다.
- STUN/TURN ICE 서버 설정은 `.env`와 배포 설정으로 분리되어 있으며, TURN credential은 코드에 하드코딩하지 않는다.
- backend `StreamingService`는 seed stream registry, playback URL builder, v1 stream API를 제공한다.
- `/api/v1/streams`, `/api/v1/streams/{streamId}`, `/api/v1/streams/{streamId}/playback`, `/api/v1/streams/{streamId}/status`가 동작한다.
- frontend는 `RealtimePlayer`가 playback API를 호출하고 WebRTC 실패 시 HLS fallback으로 전환할 수 있다.
- sample stream publish script와 streaming E2E smoke script가 존재한다.
- AI endpoint contract와 mock endpoint skeleton이 존재하며, 원본 스트리밍 playback API와 분리되어 있다.
- frontend와 backend 모두 test coverage 실행 경로가 CI에 포함되어 있다.

## Sample Stream Smoke 결과

자동화된 계약 검증은 `scripts/smoke/streaming_e2e_smoke.sh --check`로 수행한다. 이 검증은 다음 경로를 확인한다.

- sample publish path: `raw/sample/front`
- stream id: `raw.sample.front`
- backend playback API: `/api/v1/streams/raw.sample.front/playback`
- dashboard smoke route: `?streamingSmoke=1`
- WebRTC primary 및 HLS fallback 확인 절차
- STUN/ICE 및 TURN credential 점검 항목

현재 로컬 환경에서 실제 media publish까지 포함한 `--run`은 `ffmpeg`와 Docker daemon이 필요하다. 이 작업 환경에서는 `ffmpeg`가 없고 Docker daemon이 실행 중이 아니어서 live media ingest 재현은 릴리즈 후보 조건으로 남긴다. 스크립트, 문서, backend/frontend 통합 계약은 테스트로 검증한다.

## 성능 체크

`scripts/benchmarks/streaming_core_perf_check.py`는 FastAPI `TestClient`로 Streaming Core 핵심 API를 반복 호출해 로컬 지연 시간을 측정한다. 실제 네트워크, MediaMTX, 브라우저 디코딩 지연은 포함하지 않으며, API 계약과 Python app 경로의 기본 오버헤드를 확인하는 목적이다.

실행 명령:

```bash
../.venv/bin/python ../scripts/benchmarks/streaming_core_perf_check.py --iterations 100 --warmup 10 --json
```

2026-05-26 KST 로컬 결과:

| Endpoint | p50 | p95 | max | errors |
| --- | ---: | ---: | ---: | ---: |
| stream_list_api | 0.286 ms | 0.417 ms | 0.786 ms | 0 |
| stream_playback_api | 0.282 ms | 0.400 ms | 0.677 ms | 0 |
| mock_ai_detection_api | 0.219 ms | 0.306 ms | 0.421 ms | 0 |

## 정적 검증과 테스트 게이트

- backend CI는 dependency audit, compileall, mypy, pytest coverage를 실행한다.
- #24에서 mypy 대상에 `modules/ai_contract`를 추가해 AI contract/mock endpoint도 정적 검증 범위에 포함했다.
- #24 검증 중 `pip_audit --local`에서 `starlette 0.52.1 / PYSEC-2026-161`이 발견되어 `backend/requirements.txt`에 `starlette==1.0.1` 직접 pin을 추가했다.
- `prometheus-fastapi-instrumentator==7.1.0`은 `starlette<1.0.0` 제약이 있어 제거했고, `/metrics` 경로는 `prometheus-client==0.25.0`로 유지했다.
- frontend CI는 dependency audit, TypeScript typecheck, Vitest coverage, Vite build를 실행한다.
- 성능 체크 스크립트 자체는 backend pytest에 포함되어 회귀를 막는다.

## 제한사항

- 실제 현장 카메라, RTSP 송출 장비, 외부 NAT 환경에서의 WebRTC 연결은 아직 검증하지 않았다.
- TURN relay 운영 검증, 비용/사용률 최적화, 외부망 실패율 측정은 M2 이후 운영성 이슈로 넘긴다.
- dashboard 기본 화면은 아직 기존 UI가 중심이고, `RealtimePlayer`는 smoke route와 streaming feature 단위에서 먼저 검증되어 있다.
- AI endpoint는 contract/mock skeleton 단계이며, 실제 AI adapter, processor registry, overlay UI는 M4 범위다.
- frontend 전체 coverage는 legacy dashboard 영역의 미테스트 파일 때문에 아직 낮다. M2부터 TSX 전환과 컴포넌트 분리에 맞춰 coverage를 높여야 한다.
- Vite 대형 vendor chunk는 lazy loading으로 초기 app chunk와 분리했지만, media/3D 라이브러리 chunk 자체는 여전히 크다.

## M2 진입 조건

- Docker daemon, `ffmpeg`, MediaMTX가 준비된 환경에서 `scripts/smoke/streaming_e2e_smoke.sh --run`을 실제 수행한다.
- dashboard 기본 화면에 `RealtimePlayer` 기반 스트리밍 슬롯을 점진적으로 연결한다.
- mock stream 또는 테스트 미디어를 이용해 브라우저 레벨 재생 상태를 E2E로 확인한다.
- 지도 API와 asset/device registry가 들어오면 stream registry seed를 실제 registry 연동 구조로 교체한다.
- STUN만으로 실패하는 네트워크를 식별하고 TURN relay 조건과 credential 주입 방식을 운영 문서에 고정한다.
- Next.js 도입은 streaming client component와 브라우저 전용 WebRTC 경계를 먼저 분리한 뒤 결정한다.

## Release Tag 후보 기준

`v0.1.0` 태그는 #24 PR 병합 이후 아래 조건을 만족하면 생성한다.

- M1 필수 이슈가 모두 closed 상태다.
- `backend-test`와 `frontend-build` GitHub Actions가 green이다.
- backend playback API가 WebRTC primary와 HLS fallback URL을 반환한다.
- sample stream smoke 계약 검증이 통과한다.
- 실제 live media smoke는 실행 환경 제약이 해소된 곳에서 재검증하거나, 제한사항으로 명시된 상태로 승인한다.
- 이 문서가 릴리즈 노트 초안으로 승인되어 있다.
