# GCS-Saker M7 auth-policy cutover

## 목적
기존 Python backend auth를 즉시 제거하지 않고, Spring/Kotlin `auth-policy`가 동일한 dashboard 인증 contract를 제공하는 병렬 전환 경로를 만든다.

## 전환 경로
- 기본 dashboard auth endpoint: `/auth-policy/auth`
- Python legacy fallback endpoint: `/api/auth`
- dashboard build-time 전환 변수: `VITE_AUTH_API_BASE_URL`

M7-11 이후 dashboard build 기본값은 `VITE_AUTH_API_BASE_URL=/auth-policy/auth`이며 Spring/Kotlin auth-policy를 바라본다. `/api/auth`는 v0.2.0 호환 fallback으로만 남기고, 신규 dashboard signup/login/refresh/logout/me 흐름에서는 사용하지 않는다.

## 제공 contract
- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

login/refresh 응답은 기존 dashboard가 기대하는 `access_token`, `token_type`, `expires_in_minutes`, `username`, `role` DTO 형태를 유지한다. signup 응답은 Python backend 호환을 위해 `username`, `email`, `company_id`, `role`을 반환하고 password/password_hash를 반환하지 않는다. refresh token은 `HttpOnly` cookie로 내려가며, mutating auth 요청은 trusted Origin과 CSRF header를 요구한다.

## 확인 명령
```bash
scripts/m7_auth_policy_cutover_smoke.sh --check
```

single-node stack이 떠 있을 때 edge route로 auth-policy contract를 확인:

```bash
scripts/m7_auth_policy_cutover_smoke.sh --run
```

## 알려진 한계
- 현재 auth-policy user repository는 M7 PoC용 in-memory seed다.
- 실제 DB 기반 사용자 저장소와 password migration은 다음 cutover issue에서 backend schema와 함께 다룬다.
- Python backend auth route는 v0.2.0 호환 fallback으로 남아 있으나, M7 dashboard 기본 경로에서는 사용하지 않는다.
