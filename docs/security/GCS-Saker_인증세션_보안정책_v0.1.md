# GCS-Saker 인증 세션 보안 정책 v0.1

## 목표

GCS-Saker dashboard는 access token을 브라우저 영구 저장소에 저장하지 않는다. refresh token은 서버가 `HttpOnly` cookie로만 발급하며, 프론트엔드는 앱 시작 시 `/auth/refresh`를 한 번 호출해 메모리 access token을 복구한다.

## 브라우저 저장소 정책

- access token: 메모리 전용
- refresh token: `HttpOnly` cookie 전용
- localStorage: 인증/권한/토큰 저장 금지
- sessionStorage: 인증/권한/토큰 저장 금지
- UI preference 저장이 필요할 경우 민감정보가 아닌 값만 별도 key로 제한한다.

## CSRF 정책

인증 상태를 바꾸는 endpoint는 다음 조건을 만족해야 한다.

- trusted `Origin` 또는 `Referer`
- `X-GCS-CSRF: same-origin` header
- `credentials: include`

대상 endpoint:

- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/refresh`
- `POST /auth/logout`

일반 stream/API 요청은 bearer access token을 `Authorization` header로 보낸다. 다른 사이트의 단순 form 요청은 이 header를 만들 수 없으므로 cookie-only CSRF와 분리된다.

## 운영 cookie 설정

공개망 HTTPS 운영 환경:

- `AUTH_REFRESH_COOKIE_SECURE=true`
- `AUTH_REFRESH_COOKIE_SAMESITE=lax`
- `BACKEND_CORS_ALLOW_ORIGINS=https://<운영 도메인>`

폐쇄망 HTTPS 운영 환경:

- 자체 인증서 또는 내부 CA 인증서를 사용한다.
- dashboard 접속 origin을 `BACKEND_CORS_ALLOW_ORIGINS`에 명확히 등록한다.
- Secure cookie를 유지하려면 HTTPS edge가 필요하다.

로컬 개발 환경:

- HTTP 개발 서버에서는 `AUTH_REFRESH_COOKIE_SECURE=false`가 가능하다.
- 운영 배포에는 사용하지 않는다.

## 좋아진 점

- XSS 발생 시 localStorage에서 token을 훔치는 경로를 제거한다.
- refresh token은 JS에서 읽을 수 없다.
- refresh/logout CSRF 요청은 Origin/Referer와 custom header가 모두 맞아야 한다.
- access token은 짧은 수명 + 메모리 보관으로 노출 시간을 줄인다.
