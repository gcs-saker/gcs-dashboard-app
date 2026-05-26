# GCS-Saker Auth 기본 구조 전략 v0.1

작성일: 2026-05-26 KST

## 목표

M2에서는 OAuth2 provider 연동을 제외하고, 자체 login API와 JWT access token으로 dashboard와 backend API 접근 경계를 만든다. 외부 IdP, SSO, OAuth2 authorization code flow는 M4 이후 인증 고도화 항목으로 분리한다.

## 현재 구현

- `POST /auth/login`: username/password 검증 후 JWT access token 발급
- `GET /auth/me`: Bearer access token 검증 및 현재 사용자 claim 반환
- `/api/v1/streams`: viewer 이상 필요
- `/api/v1/ai/mock`: operator 이상 필요
- `/control`: operator 이상 필요
- `/asset`: viewer 이상 필요
- `/healthz`, `/readyz`, `/metrics`: 운영 상태 확인을 위해 별도 인증 없이 유지

## JWT 기준

- secret은 `AUTH_JWT_SECRET` 환경변수로 주입한다.
- repository에는 실제 secret을 저장하지 않는다.
- access token claim에는 `sub`, `role`, `token_use`, `iat`, `exp`, `iss`를 포함한다.
- token 만료는 기본 30분이며 `AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`로 조정한다.
- role 우선순위는 `viewer < operator < admin`이다.

## Frontend redirect 기준

- 미인증 사용자가 dashboard route에 접근하면 `/login?redirect=<원래 경로>`로 이동한다.
- 로그인 성공 후 같은 origin 내부 경로로만 복귀한다.
- redirect 값이 없거나 `//`로 시작하는 값은 `/`로 정규화한다.
- access token은 localStorage에 저장한다. XSS 방어가 중요한 배포 단계에서는 CSP, dependency audit, refresh token httpOnly cookie 전환을 함께 검토한다.

## Refresh token 저장 전략 초안

M2에서는 refresh token을 발급하지 않고 전략만 고정한다.

- refresh token은 access token보다 긴 TTL을 가진 opaque token으로 설계한다.
- 저장 위치는 Redis를 1순위로 둔다.
- Redis key는 `auth:refresh:{token_id}` 형태로 두고, 값에는 user id, role, 발급 시각, 만료 시각, rotation counter를 저장한다.
- client 저장은 httpOnly, Secure, SameSite=Strict cookie를 기본값으로 둔다.
- refresh 시 기존 token은 즉시 폐기하고 새 refresh token을 발급하는 rotation 방식을 사용한다.
- 로그아웃, 계정 잠금, role 변경 시 Redis token을 폐기한다.
- Redis 장애 시 refresh는 실패시키고 access token 재로그인을 요구한다.

## 테스트 기준

- login 성공/실패
- missing/invalid/expired token
- viewer stream 접근
- operator-only control 권한 실패/성공
- frontend 미인증 redirect
- frontend login 성공 후 redirect 복귀
- frontend credential 실패 메시지
- 성능 smoke script의 보호 endpoint 인증 헤더 적용

## DB 이후 확장 검증

DB 구성이 완료되면 실제 stream registry row와 ingest/mock stream event를 넣고 다음 경로를 통합 테스트한다.

1. 인증된 operator login
2. stream registry 또는 ingest API 등록
3. backend stream path resolution
4. MediaMTX playback URL 생성
5. dashboard player가 WebRTC 우선, HLS fallback 순서로 접근
6. 장애 또는 token 만료 시 dashboard가 login 또는 degraded 상태로 전환
