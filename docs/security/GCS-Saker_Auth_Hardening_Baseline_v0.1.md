# GCS-Saker Auth Hardening Baseline v0.1

## 목적

GCS-Saker dashboard는 browser, mobile, robot publisher가 같은 gateway를 통해 접근한다.
인증/인가의 기본 목표는 refresh token 탈취와 CSRF/XSS 피해를 줄이고, group 기반 권한 모델을 확장 가능한 형태로 유지하는 것이다.

## 현재 기준선

- access token은 frontend memory에만 둔다.
- refresh token은 httpOnly cookie로만 전달한다.
- legacy localStorage auth key는 읽기 시 제거한다.
- cookie를 사용하는 auth POST는 `Origin` 또는 `Referer`가 있는 browser 요청에서 `X-GCS-CSRF: same-origin` header를 요구한다.
- CORS는 configured origin만 허용한다.
- API response에는 `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`를 붙인다.

## CSRF 정책

Browser-origin 요청이 다음 endpoint를 호출할 때 CSRF header가 없으면 `403`으로 거부한다.

- `/auth/signup`
- `/auth/login`
- `/auth/refresh`
- `/auth/logout`

서버 간 호출이나 smoke script처럼 `Origin`/`Referer`가 없는 요청은 기존 운영 편의성을 위해 허용한다.
단, 실제 공개 운영에서는 edge에서 browser client에 CSRF header를 항상 붙이는 SDK/API wrapper만 사용해야 한다.

## XSS 정책

- refresh token은 JavaScript에서 읽을 수 없어야 한다.
- access token은 memory-only로 유지한다.
- localStorage/sessionStorage에 token을 다시 저장하지 않는다.
- CSP는 inline script 도입 전까지 `default-src 'self'`를 기준으로 유지한다.

## Group/Organization 권한 기준선

현재 권한은 role 기반이다. 다음 단계에서 group 기반 권한을 추가할 때는 아래 규칙을 따른다.

- user는 하나 이상의 group에 속할 수 있다.
- stream publisher는 owner group을 가진다.
- viewer는 자신의 group과 하위 group stream만 볼 수 있다.
- operator는 허용된 group stream에 대해서만 control command를 보낼 수 있다.
- admin도 audit log 없이 cross-group access를 허용하지 않는다.

## 테스트 기준

- CSRF header 누락 시 auth POST가 `403`을 반환해야 한다.
- configured origin과 CSRF header가 모두 있을 때 auth POST가 통과해야 한다.
- CORS preflight가 `Authorization`, `Content-Type`, `Accept`, `X-GCS-CSRF`를 허용해야 한다.
- frontend authenticated fetch는 refresh 요청을 한 번으로 합치고, retry 요청에 fresh access token을 붙여야 한다.
