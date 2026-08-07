# GCS-Saker 120개 재검증 및 AGENTS.md 전역 감사

검증일: 2026-08-05
저장소 HEAD: `6835a14ccf26fc489e6fffdaff47d24a25714a01`
대상: production SSH 55121, staging SSH 55122

## 결론

| 상태 | 개수 |
| --- | ---: |
| PASS | 90 |
| FAIL | 1 |
| BLOCKED | 26 |
| NOT_RUN | 3 |
| 합계 | 120 |

`BLOCKED`는 장비, 카메라, 실제 다중 송출원, 별도 NAT/LTE 단말처럼 현재 검증 환경에 없는 입력이
필요한 항목이다. `NOT_RUN`은 운영 중단 또는 장시간 부하 창이 필요한 항목이다. 코드나 서버 설정만으로
검증 가능한 항목은 재실행했다.

## 120개 상태 매트릭스

| 범위 | PASS | FAIL | BLOCKED | NOT_RUN |
| --- | --- | --- | --- | --- |
| 001~010 사용자 인증·세션 | 001~010 | - | - | - |
| 011~020 가입 토큰·장비 관리 | 011~015, 019~020 | - | 016~018 | - |
| 021~030 장비 송출 세션 | 021~030 | - | - | - |
| 031~040 스트림 수신·다중 스트림 | 031~033, 037, 039~040 | - | 034~036, 038 | - |
| 041~050 오디오·talkback | 048 | - | 041~047, 049~050 | - |
| 051~060 gRPC telemetry/GPS | 051~059 | - | 060 | - |
| 061~070 계층형 그룹 보안 | 061~070 | - | - | - |
| 071~080 Secret·Redis·로그·TLS | 071~076, 078~080 | 077 | - | - |
| 081~090 UI·이벤트·운영 설정 | 081~090 | - | - | - |
| 091~100 CCTV·외부 네트워크 | 091, 095 | - | 092~094, 096~100 | - |
| 101~110 운영 상태·복구 | 101~109 | - | - | 110 |
| 111~120 빌드·부하·장시간 안정성 | 111~117 | - | 118 | 119~120 |

## 주요 실행 증거

- production/staging `/`, `/healthz`, `/readyz`: 모두 HTTPS 200, 인증서 검증 결과 0.
- 인증서 SAN은 각각 production/staging `sslip.io` 호스트와 일치하며 만료일은 2026-11-02이다.
- Caddy는 h1/h2/h3를 제공하고 HSTS, CSP, Permissions-Policy, X-Content-Type-Options,
  X-Frame-Options, Referrer-Policy를 설정한다.
- 외부 gRPC `Exchange`는 metadata 없이 `UNAUTHENTICATED unauthorized_gateway_metadata`를 반환한다.
- 외부 TCP 노출은 443, 55121, 55122만 확인됐다. 22, 80, 5432, 6379, 8080, 8081, 8554,
  8888, 8889, 9090은 닫혀 있다.
- `/media-control/api/v1/streams` 비인증 요청은 production/staging 모두 401이다.
- 악성 origin의 auth preflight는 403이다.
- `/publisher/`는 dashboard 로그인으로 이동하지 않고 독립 `GCS Mobile Publisher` 로그인 화면을 제공한다.
- 390x844 viewport에서 publisher 화면의 `scrollWidth`와 viewport width가 모두 390으로 수평 overflow가 없다.
- GitHub PR #601의 repository, frontend, backend, auth-policy, media-control job은 현재 HEAD에서 모두 성공했다.
- 로컬 Ruff, format, mypy는 통과했다. backend Windows 실행의 26건 실패는 Linux shell/protoc 실행 방식
  차이였고 동일 HEAD Linux CI는 성공했다.
- frontend Linux bind-mount 재실행은 478개 중 475개가 통과했으나 worker timeout과 lazy route 대기로
  3개가 실패했다. 동일 HEAD GitHub Linux CI는 491개 및 build/E2E를 통과하므로 기능 회귀가 아니라
  느린 bind mount에서 드러난 테스트 격리·시간 의존성으로 분류한다.

## AGENTS.md 기준 신규 발견사항

### P1 — 배포 원자성과 provenance 불일치

`current` symlink는 양 서버 모두 `p0p2-32302fc-20260805`를 가리키지만 production 실행 컨테이너는
다음과 같이 서로 다른 revision과 Compose working directory를 사용한다.

- backend: `05a7006`, Compose release `p0p2-05a7006-20260805`
- dashboard: `05a7006`, Compose release `p0p2-05a7006-20260805`
- media-control: `05a7006`, Compose release `p0p2-05a7006-20260805`
- auth-policy: `32302fc`, Compose release `p0p2-32302fc-20260805`

파일 symlink만 보고 배포 성공으로 판정할 수 없으며 API·프로토콜 계약이 혼합될 수 있다. 배포는 하나의
release manifest에 고정된 네 이미지 digest를 사용하고, 모든 컨테이너의 OCI revision과 Compose
working directory가 목표 commit과 일치할 때만 성공 처리해야 한다.

### P1 — 실제 client IP 감사 로그 부재

Caddy에 access log가 설정되어 있지 않고 upstream nginx에는 `127.0.0.1` 요청만 기록된다. 따라서
AGENTS.md의 인증·송출 경계 IP 감사 요구를 충족하지 못한다. Caddy JSON access log에 검증된 client IP,
request ID, route, status, latency를 남기되 Authorization, cookie, UUID credential, publish token과 query
secret은 제외·마스킹해야 한다. 로그 rotation과 보존 기간도 함께 설정해야 한다.

### P1 — 컨테이너 런타임 hardening과 자원 격리 누락

애플리케이션 프로세스는 비-root이지만 production의 backend, dashboard, auth-policy, media-control은
`ReadonlyRootfs=false`, `CapDrop=null`, `SecurityOpt=null`, memory/CPU limit 0이다. edge는 user가 비어
있어 root로 실행된다. `read_only`, writable tmpfs, `cap_drop: [ALL]`, `no-new-privileges`, 명시적 user,
메모리·CPU·PID·파일 디스크립터 제한을 서비스별로 검증해 적용해야 한다.

### P1 — staging의 별도 nginx restart loop

Server-02에 GCS stack 외 `nginx:alpine` 컨테이너가 restart loop 상태로 남아 있다. 포트 충돌과 로그
증가 가능성이 있으며 소유 stack과 목적이 확인되지 않는다. Coolify 또는 기존 서비스 소유 여부를 확인한
뒤 구성 오류를 수정하거나 안전하게 제거해야 한다.

### P1 — 재현 가능한 image pinning 미완료

Dockerfile base image는 digest로 고정돼 있지만 Compose runtime image 중 PostGIS, Redis, Mosquitto,
MediaMTX, coturn, nginx와 기본 `gcs-mobile-publisher:latest`가 mutable tag다. 운영 release manifest에서는
모든 image digest와 source commit을 고정하고 SBOM·취약점 결과를 release artifact에 연결해야 한다.

### P2 — frontend 테스트의 시간·환경 의존성과 중복

느린 파일시스템에서 lazy route가 테스트 제한 시간 안에 로드되지 않아 Login/App 테스트 3건이 실패했고
Vitest worker timeout 3건 및 다수의 React `act(...)` 경고가 발생했다. `App.test.jsx`와
`App.test.tsx`, `setupTests.js`와 `setupTests.ts`도 중복 유지되고 있다. 테스트 worker 수를 CI 계약으로
고정하고 lazy route 준비를 명시적으로 기다리며 JavaScript 잔여 사본을 제거해야 한다.

### P2 — 운영 문서와 source comment 문자 인코딩 손상

기존 `GCS-Saker_120_point_runtime_validation_2026-08-05.md`와 dashboard Dockerfile 일부 주석이
mojibake 상태다. 운영 인수인계 자료의 의미가 손상되므로 UTF-8로 복구하고 repository contract에서
Markdown, Dockerfile, 설정 파일의 UTF-8 decode를 검사해야 한다.

### P2 — SPA fallback이 운영 경로 오타를 200으로 은폐

`/swagger`, `/docs`, `/openapi.json`, `/metrics`를 비인증 호출하면 실제 운영 API가 아니라 dashboard
`index.html`이 200으로 반환된다. 데이터 노출은 아니지만 모니터링과 운영자 오진을 유발한다. edge에서
예약된 API·운영 prefix의 unknown route는 JSON 404/410으로 종료하고 SPA fallback은 UI route에만
적용해야 한다.

## 현재 장비 없이 완료할 수 없는 항목

- 실제 영상/오디오 입력: 034~036, 038, 041~047, 049~050, 060, 092~094, 118
- 별도 네트워크·단말: 096~100
- 가입 토큰 destructive/one-time 실제 흐름: 016~018은 격리된 시험 계정과 만료 대기 창이 필요하다.
- 운영 중단·장시간 관측: 110, 119~120

## 다음 조치 순서

1. 혼합 revision 배포를 하나의 release로 원자적으로 재배포하고 runtime attestation을 추가한다.
2. Caddy client-IP 감사 로그와 마스킹·rotation을 적용한다.
3. staging restart-loop nginx의 소유자와 포트 목적을 확인한다.
4. 컨테이너 hardening 및 자원 limit을 staging에서 먼저 검증한다.
5. 장비 시험 창에서 blocked 26개와 2/8/24시간 soak를 수행한다.
