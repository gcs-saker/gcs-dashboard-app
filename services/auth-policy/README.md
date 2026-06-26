# GCS-Saker Auth Policy Service

Spring Boot + Kotlin 기반 인증/인가 및 group policy control-plane PoC 서비스다.

## 역할

- JWT access token claim 모델 검증
- login/refresh/me/logout contract 제공
- 사용자 role과 group scope 기반 stream 접근 정책 검증
- 장기적으로 refresh session, device identity, TURN credential 발급 위치를 담당

## 원칙

- 기존 FastAPI auth는 legacy profile로 남기되, M7 single-node 전환 경로에서는 `VITE_AUTH_API_BASE_URL=/auth-policy/auth`로 auth-policy를 바라본다.
- 폐쇄망에서도 외부 identity provider 없이 동작할 수 있어야 한다.
- DTO/VO와 domain service를 분리한다.
- group hierarchy와 stream routing policy는 테스트 가능한 domain model로 먼저 만든다.

## Auth contract

- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /policy/streams/access`

응답 DTO는 기존 dashboard가 사용하던 `access_token`, `token_type`, `expires_in_minutes`, `username`, `role` 형태를 유지한다. refresh token은 `HttpOnly` cookie로 내려가며, 운영 배포에서는 `AUTH_POLICY_REFRESH_COOKIE_SECURE=true`와 HTTPS edge를 같이 사용한다.

`POST /auth/login`, `POST /auth/signup`, `POST /auth/refresh`, `POST /auth/logout`은 CSRF 방어를 위해 trusted `Origin` 또는 `Referer`와 `X-GCS-CSRF: same-origin` header를 요구한다. dashboard는 정적 auth header 상수를 재사용해 이 값을 보낸다.

`POST /auth/signup`은 기존 Python `/auth/signup` 응답 contract와 맞춰 `id`, `username`, `email`, `company_id`, `role`만 반환한다. 비밀번호는 PBKDF2 단방향 hash로 저장하고 응답에는 원문/해시 모두 포함하지 않는다. 초대코드 매핑은 `AUTH_POLICY_SIGNUP_INVITES=code:companyId:groupId` 형식으로 주입한다.

`POST /policy/streams/access`는 bearer access token을 검증한 뒤 stream 발행 group과 사용자 group/role을 비교한다. 같은 group viewer는 허용하고, operator/admin은 담당 group 하위 stream까지 허용한다. M7 PoC에서는 in-memory user/group repository를 사용하며, DB-backed repository 전환 전까지는 정책 모델과 API contract를 고정하는 역할이다.

## Time Sync API

- `GET /ops/time/status`: 현재 서버 시각, 설정된 시간 source, drift 경고 기준, 상태를 반환한다.
- `POST /ops/time/check`: 같은 contract로 즉시 점검 결과를 반환한다.
- `PUT /ops/time/config`: operator/admin만 공개망, 폐쇄망, 수동/격리 모드 설정을 변경한다.

환경 변수 기본값은 `TIME_SYNC_MODE=public`, `TIME_SYNC_SOURCE_HOST=pool.ntp.org`, `TIME_SYNC_SOURCE_PORT=123`, `TIME_SYNC_DRIFT_WARN_MS=1000`이다. 폐쇄망 납품에서는 `TIME_SYNC_MODE=closed_network`와 내부 NTP 서버 IP 또는 도메인을 주입한다. 앱은 host clock을 직접 변경하지 않고, 실제 chrony/systemd-timesyncd 적용은 운영 계층에서 분리한다.

## Observability

Spring Actuator, Micrometer, Prometheus registry를 사용해 auth-policy JVM/runtime/API 지표를 노출한다.

- 내부 scrape endpoint: `GET /actuator/prometheus`
- 기존 liveness/readiness contract: `GET /healthz`, `GET /readyz`
- public edge 차단 경로: `/auth-policy/actuator/*`

운영 Nginx는 `/auth-policy/*` API는 프록시하지만 `/auth-policy/actuator/*`는 `404`로 막는다. Prometheus나 임시 점검 스크립트는 Docker 내부 네트워크에서 `http://auth-policy:8080/actuator/prometheus`를 사용해야 한다.

Micrometer Tracing bridge는 W3C `traceparent`를 이어받아 요청별 trace id를 로그 MDC와 `X-GCS-Trace-Id` 응답 헤더에 남긴다. 기본값은 `AUTH_POLICY_TRACING_SAMPLING_PROBABILITY=1.0`이며, collector가 없는 공개망/폐쇄망 개발 환경에서도 서비스는 정상 실행된다. 폐쇄망에서 collector를 붙일 때는 OpenTelemetry collector를 같은 control-net에 두고, 외부 인터넷 exporter가 아닌 내부 OTLP endpoint를 사용한다.

`/readyz`의 JDBC와 Redis dependency check는 observation으로 감싼다. 따라서 tracing handler/collector가 붙은 환경에서는 인증/정책 서버가 DB와 cache 상태 점검을 어느 구간에서 지연시키는지 같은 trace 흐름에서 확인할 수 있다.

## 테스트

```bash
./gradlew test jacocoTestReport jacocoTestCoverageVerification
```

Gradle wrapper는 `8.14.3`으로 고정한다. 폐쇄망 납품 전에는 Gradle distribution, Maven dependency cache, Docker image tarball을 함께 패키징해야 한다.
