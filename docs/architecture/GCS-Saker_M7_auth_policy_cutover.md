# GCS-Saker M7 auth-policy cutover

## 목적
기존 Python backend auth를 즉시 제거하지 않고, Spring/Kotlin `auth-policy`가 동일한 dashboard 인증 contract를 제공하는 병렬 전환 경로를 만든다.

## 전환 경로
- 기본 dashboard auth endpoint: `/api/auth`
- Spring/Kotlin auth-policy 전환 endpoint: `/auth-policy/auth`
- dashboard build-time 전환 변수: `VITE_AUTH_API_BASE_URL`

운영 기본값은 기존 Python auth를 유지한다. M7 검증 또는 폐쇄망 appliance PoC에서만 `VITE_AUTH_API_BASE_URL=/auth-policy/auth`로 빌드해 Spring/Kotlin auth-policy를 바라보게 한다.

## 제공 contract
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/logout`

응답은 기존 dashboard가 기대하는 `access_token`, `token_type`, `expires_in_minutes`, `username`, `role` DTO 형태를 유지한다. refresh token은 `HttpOnly` cookie로 내려가며, mutating auth 요청은 trusted Origin만 허용한다.

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
- `signup`은 아직 Python backend 경로에 남겨둔다. dashboard 회원가입 UX와 invite-code DB contract가 Python SQLAlchemy model에 묶여 있기 때문이다.
