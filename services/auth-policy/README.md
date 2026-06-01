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

`POST /auth/signup`은 기존 Python `/auth/signup` 응답 contract와 맞춰 `id`, `username`, `email`, `company_id`, `role`만 반환한다. 비밀번호는 PBKDF2 단방향 hash로 저장하고 응답에는 원문/해시 모두 포함하지 않는다. 초대코드 매핑은 `AUTH_POLICY_SIGNUP_INVITES=code:companyId:groupId` 형식으로 주입한다.

`POST /policy/streams/access`는 bearer access token을 검증한 뒤 stream 발행 group과 사용자 group/role을 비교한다. 같은 group viewer는 허용하고, operator/admin은 담당 group 하위 stream까지 허용한다. M7 PoC에서는 in-memory user/group repository를 사용하며, DB-backed repository 전환 전까지는 정책 모델과 API contract를 고정하는 역할이다.

## 테스트

```bash
./gradlew test jacocoTestReport
```

Gradle wrapper는 `8.14.3`으로 고정한다. 폐쇄망 납품 전에는 Gradle distribution, Maven dependency cache, Docker image tarball을 함께 패키징해야 한다.
