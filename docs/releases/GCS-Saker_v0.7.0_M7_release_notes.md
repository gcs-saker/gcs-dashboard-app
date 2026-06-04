# GCS-Saker v0.7.0 M7 Release Notes

작성일: 2026-06-04 KST

## 요약

M7은 기존 Python 중심 운영 구조에서 Spring/Kotlin auth-policy, Go media-control, MediaMTX, coturn, Redis, React/TypeScript dashboard가 역할을 나누는 active runtime path를 완성한 milestone이다. M7 완료 기준은 "Python 코드가 repository에서 완전히 사라지는 것"이 아니라, dashboard와 운영 smoke가 사용하는 인증/인가, stream control-plane, ICE/TURN, telemetry/asset read-model 경로가 Python backend 없이 통과하는 것이다.

## 포함된 주요 이슈

- #229 Telemetry/asset read API Python 의존 제거 계약 고정
- #231 Telemetry ingest와 read-model smoke 연결 고정
- #233 M7 완료 게이트와 Python legacy 범위 격리
- #275 M7 final cleanup 보안 위생 및 운영 정리
- #277 M7 completion release note 고정

## 가능해진 것

- Dashboard 기본 인증 경로가 Spring/Kotlin `auth-policy`를 바라본다.
- Stream list/playback/status/ICE server contract가 Go `media-control` 경로로 검증된다.
- MediaMTX WHEP/HLS 경로가 edge proxy 아래에서 동작한다.
- coturn primary/secondary가 운영 compose에서 분리되어 있고, TURN relay smoke contract가 존재한다.
- telemetry ingest/read와 asset read 경로가 Spring/Kotlin read-model로 들어간다.
- Server-01 production과 Server-02 staging이 같은 M7 branch commit으로 정렬된다.

## Backend/API 변경

- `auth-policy`
  - login/signup/refresh/logout/me API를 Spring/Kotlin controller와 DTO로 분리했다.
  - refresh token은 httpOnly cookie로 내려가며, mutating auth endpoint는 CSRF header를 요구한다.
  - stream policy, telemetry, asset, operational events read-model contract를 고정했다.
- `media-control`
  - stream API, playback URL, ICE server response, MediaMTX adapter, auth-policy authorization client를 Go로 분리했다.
  - `/stream/status`는 deprecated compatibility endpoint로 남기되 replacement route를 함께 내려준다.
- Python backend
  - M7 active runtime path의 blocker가 아닌 legacy/future/mock endpoint 호환 레이어로 격리했다.

## Server/Deployment 변경

- Server-01 production과 Server-02 staging 모두 M7 branch `5bf3451`에 맞췄다.
- Server-02 root-owned checkout을 `user:user`로 정리해 `dubious ownership`을 제거했다.
- Nginx edge는 외부 ingress를 HTTPS 중심으로 유지하고, dashboard/auth-policy/media-control/MediaMTX 경로를 reverse proxy한다.
- 운영 HTTPS 응답에서 HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP, Permissions-Policy가 확인됐다.

## Test 결과

- Python backend: `254 passed`, coverage `96%`
- Frontend: `142 passed`, statements `85.94%`, branches `72.54%`, functions `89.35%`, lines `87.56%`
- Kotlin/Spring: `./gradlew check` 통과
- Go media-control: `go test ./... -cover` 통과
- Frontend build: `npm run build` 통과
- Docker compose config: single-node future-services profile 통과
- M7 runtime smoke: 통과
- M7 auth-policy cutover smoke: 통과
- M7 media-control cutover smoke: 통과
- M7 external NAT WebRTC smoke check: 통과

## Security/Audit 결과

- `npm audit --audit-level=low`: 0 vulnerabilities
- `python3.12 -m pip_audit -r backend/requirements.txt`: No known vulnerabilities found
- 운영 edge에서 CSRF header 없는 valid DTO login POST는 `403 Forbidden`으로 거절된다.
- 운영 HTTPS dashboard 응답에서 browser security headers가 확인됐다.
- `.env`와 scratch 파일이 Git 추적 대상에서 제거됐고, 재추적 방지 contract test가 추가됐다.

## Known Issues

- GitHub push 경고는 default branch 기준 취약점 14개를 표시했다. M7 branch의 local frontend/Python audit는 0건이므로, dependency graph가 어느 branch/manifest를 기준으로 보는지 다음 security cleanup에서 확인한다.
- `passlib`가 Python 3.13 제거 예정인 `crypt`를 내부 import한다. M7 backend는 Python `>=3.12,<3.13`으로 고정되어 있어 현재 장애는 아니지만 다음 보안 업데이트 후보이다.
- `lazy-hls-light` bundle은 lazy chunk로 분리되어 있지만 크기가 크다. 초기 bundle에는 포함되지 않으므로 M7 완료 blocker는 아니며, HLS fallback 최적화 이슈에서 다룬다.
- Python backend의 일부 legacy/future/mock endpoint는 남아 있다. 제품 기능으로 승격할 때는 Spring/Kotlin 또는 Go 경로로 별도 이슈에서 이전한다.

## Rollback 기준

- Server-01/Server-02 checkout을 이전 M7 commit 또는 `v0.2.0` tag 기준으로 되돌린다.
- Docker compose env file과 cert path는 기존 서버 private 경로를 유지한다.
- edge restart 후 `/`, `/healthz`, `/readyz`, `/stream/status`가 200을 반환해야 rollback 완료로 본다.

## 다음 Milestone 진입 조건

- GitHub dependency graph의 default branch 취약점 경고 원인을 확인한다.
- legacy/future/mock endpoint를 제품 기능으로 승격할 항목과 제거할 항목으로 분리한다.
- 운영 장애 주입 테스트를 실제 restart/Redis/TURN/MediaMTX 중단 시나리오로 확장한다.
- stream latency benchmark를 publish/play 실제 흐름 기준으로 자동화한다.
