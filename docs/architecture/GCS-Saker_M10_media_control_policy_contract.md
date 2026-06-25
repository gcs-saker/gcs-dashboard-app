# GCS-Saker M10 Media-Control Policy Contract

## 목적

Go `media-control`은 stream/media control-plane의 빠른 집행 계층이다.
권한 판단은 Spring/Kotlin `auth-policy`가 담당한다.

- Spring/Kotlin `auth-policy`: Policy Decision Point
- Go `media-control`: Policy Enforcement Point
- MediaMTX: media-plane publish/playback 수행

## Auth Mode

`MEDIA_CONTROL_AUTH_MODE`는 다음 값만 허용한다.

- `required`: 운영 기본값이다. `AUTH_POLICY_BASE_URL`이 없으면 `media-control`은 시작하지 않는다.
- `allow-all`: 로컬 개발 또는 테스트 전용이다. 이 값을 명시하지 않으면 우회가 활성화되지 않는다.

운영, staging, 폐쇄망 profile은 모두 `required`를 사용한다.

## Decision DTO

`auth-policy`의 `POST /policy/streams/access` 응답은 다음 필드를 포함한다.

- `streamId`: 검증 대상 stream 식별자
- `allowed`: 접근 허용 여부
- `reason`: 허용/거부 사유
- `principalId`: 판단 대상 주체
- `groupId`: 주체의 그룹
- `expiresAt`: decision cache 상한 시각
- `policyVersion`: 정책 버전
- `principalVersion`: 주체 버전
- `permissions`: 주체 권한 목록

Go는 이 응답을 해석해 media-control endpoint를 집행한다.
Go는 group hierarchy나 role rule을 직접 해석하지 않는다.

## Failure Policy

- Authorization header 누락: `401`
- auth-policy `401`: `401`
- auth-policy `403` 또는 deny decision: `403`
- auth-policy timeout/5xx/network failure: `502`
- auth-policy base URL 누락 in `required` mode: startup failure

장애 시 기본 정책은 fail-closed다.
즉, auth-policy가 불확실하면 stream/playback/ICE credential을 제공하지 않는다.

## Cache Policy

`MEDIA_CONTROL_AUTHZ_CACHE_TTL_SECONDS`는 성능 최적화를 위한 상한이다.
실제 cache 만료는 다음 중 더 빠른 시각을 따른다.

- Go 설정 TTL
- Spring decision의 `expiresAt`

따라서 권한 변경 후 stale decision window는 `min(MEDIA_CONTROL_AUTHZ_CACHE_TTL_SECONDS, expiresAt-now)`로 제한된다.
현재 기본값은 2초다.

## Protected Routes

다음 응답은 auth-policy decision 이후에만 반환된다.

- `GET /api/v1/streams`
- `GET /api/v1/streams/{streamId}`
- `GET /api/v1/streams/{streamId}/playback`
- `GET /api/v1/streams/{streamId}/status`
- `GET /api/v1/streams/{streamId}/publish`
- `GET /api/v1/streams/ice-servers`
- `GET /v1/ice-servers`

특히 ICE server response는 TURN credential을 포함할 수 있으므로 인증 전에 반환하지 않는다.

## MediaMTX Publish Gate

대시보드 또는 송출 클라이언트는 `media-control`에서 인증된 WHIP URL을 먼저 발급받는다.
MediaMTX publish는 `publisherToken`이 있는 요청만 허용한다.

이 구조는 공개 publish endpoint가 임의 장비에 열리는 것을 막는다.
