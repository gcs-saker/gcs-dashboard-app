# GCS-Saker M10 Endpoint Catalogue

이 문서는 협업자가 GCS-Saker에 붙을 때 필요한 URL, 인증 방식, 요청 데이터, 프로토콜 경계를 한 곳에서 확인하기 위한 기준 문서다.

## 1. 공개 인입 원칙

운영망과 테스트망 모두 public entrypoint는 Nginx 443 하나로 둔다.

| 영역 | 외부 URL 기준 | 실제 대상 | 프로토콜 | 비고 |
| --- | --- | --- | --- | --- |
| Dashboard | `/` | React dashboard | HTTPS | 정적 앱과 SPA route |
| Auth / Policy | `/auth-policy/*` | Spring/Kotlin auth-policy | HTTPS JSON | 인증, 세션, 그룹 정책, 운영 read model |
| Dashboard API compatibility | `/api/ops/*`, `/api/telemetry/*`, `/api/asset/*` | Spring/Kotlin auth-policy | HTTPS JSON/SSE | 프론트 `VITE_API_BASE_URL=/api` 호환 |
| Media control | `/media-control/*` | Go media-control | HTTPS JSON | stream registry, ICE server, playback/publish 권한 |
| WebRTC signaling | `/webrtc/*` | MediaMTX | HTTPS WHIP/WHEP | media signaling |
| HLS fallback | `/hls/*` | MediaMTX | HTTPS HLS | fallback playback |
| Legacy map config | `/api/v1/map/config` | Python fallback | HTTPS JSON | auth-policy read model로 이전 예정 |

직접 공개하지 않는 포트는 `3000`, `8001`, `8080`, `8081`, `8888`, `8889`, `9090`, DB, Redis/DragonFly, MQTT broker admin port다.

## 2. 공통 헤더와 인증

| 이름 | 값/형태 | 사용처 | 설명 |
| --- | --- | --- | --- |
| `Authorization` | `Bearer <accessToken>` | 보호 API 전체 | access token 기반 인증/인가 |
| `X-GCS-CSRF` | `same-origin` | browser write 요청 | 로그인 이후 변경성 요청 보호 |
| `traceparent` | W3C Trace Context | control-plane 요청 | edge, Spring, Go, MediaMTX adapter 추적 연결 |
| `tracestate` | W3C Trace Context | control-plane 요청 | trace vendor 확장 |
| `X-GCS-Trace-Id` | 서버 생성 trace id | 응답 | 장애 분석용 요청 상관관계 |

Refresh token은 httpOnly cookie로 취급한다. password, refresh token, media token signing secret, TURN credential, gateway token은 문서, PR, 브라우저 bundle에 노출하지 않는다.

## 3. 프론트 환경값

| 환경값 | 기본값 | 용도 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | dashboard 운영/telemetry/asset compatibility API |
| `VITE_AUTH_API_BASE_URL` | `/auth-policy/auth` | login, signup, refresh, logout, me |
| `VITE_STREAM_API_BASE_URL` | `/media-control` | stream registry, ICE, playback, publish |
| `VITE_HLS_BASE_URL` | `/hls` | HLS fallback URL 생성 |
| `VITE_LOCAL_WEBCAM_WHIP_URL` | `/webrtc/raw/local/webcam/whip` | 개발용 browser publisher WHIP |
| `VITE_WEBRTC_STUN_URL` | `stun:stun.l.google.com:19302` | 브라우저 fallback ICE seed |
| `VITE_MAP_PROVIDER` | `esri-satellite` | 지도 provider 선택 |
| `VITE_MAP_STYLE_URL` | Esri satellite tile URL | 공개망 지도 tile |

폐쇄망에서는 `VITE_MAP_PROVIDER=offline`, `VITE_WEBRTC_STUN_URL=stun:<internal-host>:3478`, `VITE_HLS_BASE_URL=/hls`, `VITE_STREAM_API_BASE_URL=/media-control`을 유지한다.

## 4. Dashboard Auth API

외부 기준 base URL은 `/auth-policy/auth`다. 서비스 내부 Spring route base는 `/auth`다.

| Method | 외부 URL | 필요한 데이터 | 응답 핵심 필드 | 비고 |
| --- | --- | --- | --- | --- |
| `POST` | `/auth-policy/auth/signup` | `username`, `password`, `email`, `inviteCode`, 선택 `displayName`, `groupId` | `user`, `accessToken`, `tokenType`, `expiresInSeconds` | 운영 초대 코드 정책 필요 |
| `POST` | `/auth-policy/auth/login` | `username`, `password` | `user`, `accessToken`, `tokenType`, `expiresInSeconds` | refresh token은 cookie |
| `POST` | `/auth-policy/auth/refresh` | httpOnly refresh cookie, `X-GCS-CSRF` | `accessToken`, `tokenType`, `expiresInSeconds` | session 유지 |
| `GET` | `/auth-policy/auth/me` | `Authorization` | `username`, `role`, `groupId`, `permissions` | URL 직접 접근 시 auth guard 기준 |
| `POST` | `/auth-policy/auth/logout` | `Authorization`, cookie, `X-GCS-CSRF` | empty/ok | refresh session 폐기 |

## 5. Dashboard Operational API

외부 기준 base URL은 `/api` compatibility route다. Nginx가 Spring auth-policy로 전달한다.

| Method | 외부 URL | 필요한 데이터 | 응답 핵심 필드 | 용도 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/telemetry/all` | `Authorization` | stream/asset telemetry list | dashboard telemetry table |
| `POST` | `/api/telemetry/` | `Authorization`, `uuid`, `lat`, `lng`, `altitude`, `battery`, `timestamp` | ingested telemetry | 임시 ingest, device gateway 이전 대상 |
| `GET` | `/api/telemetry/{uuid}/history` | `Authorization` | telemetry history | 선택 stream geometry/telemetry |
| `GET` | `/api/asset/{gatewayUuid}` | `Authorization` | asset profile/status | 자산 트리 |
| `GET` | `/api/ops/server-health/snapshots` | `Authorization` | server health snapshots | 서버 상태 화면 |
| `POST` | `/api/ops/server-health/snapshots` | `Authorization`, service/status/rtt/timestamp | saved snapshot | 운영 상태 ingest |
| `GET` | `/api/ops/stream-sessions` | `Authorization` | active stream sessions | 수신 가능한 스트림 목록 |
| `POST` | `/api/ops/stream-sessions` | `Authorization`, stream/session descriptor | saved stream session | stream session 갱신 |
| `GET` | `/api/ops/stream-sessions/stream` | `Authorization` | SSE heartbeat/session event | 연결/해제 UI 반영 |
| `GET` | `/api/ops/events` | `Authorization`, query filter | event list | 이벤트 로그 |
| `GET` | `/api/ops/events/page` | `Authorization`, `page`, `size`, filters | page response | 이벤트 로그 paging |
| `GET` | `/api/ops/events/stream` | `Authorization` | SSE event stream | 실시간 이벤트 로그 |
| `GET` | `/api/ops/events/metrics` | `Authorization`, time range | severity, ICE path, session metrics | 운영 그래프 |
| `GET` | `/api/ops/events/buckets` | `Authorization`, time range | time bucket counts | 타임라인 그래프 |
| `GET` | `/api/ops/time/status` | `Authorization` | source, offset, drift, health | 시간 동기화 상태 |
| `POST` | `/api/ops/time/check` | `Authorization`, target time source | offset/check result | 시간 서버 검증 |
| `PUT` | `/api/ops/time/config` | `Authorization`, time source config | active config/status | 공개망/폐쇄망 시간 서버 설정 |

## 6. Media Control API

외부 기준 base URL은 `/media-control`이다. Dashboard helper는 `/media-control/api/v1/...` 형태를 만든다.

| Method | 외부 URL | 필요한 데이터 | 응답 핵심 필드 | 용도 |
| --- | --- | --- | --- | --- |
| `GET` | `/media-control/healthz` | 없음 | `status`, `service` | service liveness |
| `GET` | `/media-control/readyz` | 없음 | `status`, `checks[]` | stream registry, ICE, gRPC readiness |
| `GET` | `/media-control/api/v1/streams` | `Authorization` | `streams[]` | 선택 가능한 stream registry |
| `GET` | `/media-control/api/v1/streams/ice-servers` | `Authorization` | `iceServers[]` | STUN 우선, TURN fallback 후보 |
| `GET` | `/media-control/api/v1/streams/{streamId}` | `Authorization` | stream descriptor | stream detail |
| `GET` | `/media-control/api/v1/streams/{streamId}/playback` | `Authorization` | `playbackUrls.webrtc`, `playbackUrls.hls` | dashboard 수신 |
| `GET` | `/media-control/api/v1/streams/{streamId}/publish` | `Authorization` | `streamId`, `whipUrl` | browser/mobile publisher |
| `GET` | `/media-control/api/v1/streams/{streamId}/status` | `Authorization` | `streamId`, `status` | 연결 상태 |
| `GET` | `/stream/status` | 없음 | deprecated status | legacy smoke only |

Go media-control은 Spring auth-policy의 `POST /policy/streams/access`로 stream 접근 정책을 질의한다. 권한 없는 stream은 목록에서 제외하거나 단건 요청에 `403`을 반환한다.

`publish` 응답의 `whipUrl`에는 HMAC signed short-lived `publisherToken`이 포함된다. MediaMTX auth hook은 `streamId`, `path`, `groupId`, `action`, `exp`, signature를 모두 검증한다.

## 6-1. Device Publish Policy API

외부 로봇/드론은 URL이나 stream id에 `groupId`를 섞지 않는다. auth-policy가 등록 장비의 `deviceUuid`와 credential을 검증한 뒤 DB의 장비 소속 group을 `publisherGroupId`로 결정한다.

| Method | 외부 URL | 필요한 데이터 | 응답 핵심 필드 | 용도 |
| --- | --- | --- | --- | --- |
| `POST` | `/auth-policy/policy/devices/publish` | `deviceUuid`, `credential`, `streamId`, `path` | `deviceUuid`, `streamId`, `path`, `publisherGroupId`, `policyVersion` | robot/drone publish group 결정 |

이 API 요청 body에는 `groupId`를 받지 않는다. 장비 group은 `registered_devices.group_id`가 원장이다.

## 7. WebRTC, HLS, MediaMTX

| 경로 | 프로토콜 | 누가 사용하나 | 설명 |
| --- | --- | --- | --- |
| `/webrtc/{streamPath}/whip` | WHIP over HTTPS | browser/mobile publisher, external camera gateway | stream 송출 |
| `/webrtc/{streamPath}/whep` | WHEP over HTTPS | dashboard player | WebRTC 수신 signaling |
| `/hls/{streamPath}/index.m3u8` | HLS over HTTPS | fallback player, 녹화/돌려보기 후보 | WebRTC 실패 시 fallback |
| `stun:<host>:3478` | STUN | browser/native client | direct candidate 수집 |
| `turn:<host>:3478` | TURN | browser/native client | relay fallback |

Media frame은 WebRTC/HLS media plane으로만 보낸다. JSON, MQTT, gRPC, GraphQL에 video/audio frame을 직접 태우지 않는다.

## 8. Internal gRPC / Protobuf Boundary

브라우저는 gRPC에 직접 연결하지 않는다. gRPC는 service-to-service 또는 device/native gateway 전용이다.

| 항목 | 값 |
| --- | --- |
| Service | `gcs.saker.v1.SakerGatewayService` |
| Method | `/gcs.saker.v1.SakerGatewayService/Exchange` |
| Metadata | `x-gcs-gateway-token`, `authorization: bearer <token>` |
| Payload kind | `telemetry`, `stream_event`, `command_ack`, `command`, `telemetry_batch` |
| 필수 식별자 | `requestId`, `orgId`, `groupId`, `assetId` |
| 최대 payload | `MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES`, 기본 `65536` |

gRPC 응답은 `accepted`, `rejected`, `backpressure`, `reconnect` 중 하나의 ack 상태를 반환한다. `backpressure`는 장비 gateway가 전송량을 줄이거나 batch 전략을 바꾸는 신호다.

## 9. MQTT Topic Boundary

MQTT는 telemetry, command, status, command ack 같은 control/data plane을 흡수한다.

| 용도 | Topic |
| --- | --- |
| telemetry publish | `gcs/{orgId}/{groupId}/{assetId}/telemetry` |
| command publish | `gcs/{orgId}/{groupId}/{assetId}/command` |
| status publish | `gcs/{orgId}/{groupId}/{assetId}/status` |
| command ack publish | `gcs/{orgId}/{groupId}/{assetId}/command_ack` |
| telemetry subscribe | `gcs/+/+/+/telemetry` |

MQTT payload는 Protobuf를 우선한다. broker credential은 장비 gateway 또는 서버 내부 설정으로만 보관하고 dashboard bundle에 넣지 않는다.

## 10. Legacy / Fallback API

Python backend는 active core가 아니라 legacy/fallback으로 낮춘다.

| Legacy route | 현재 목적 | 대체 경로 |
| --- | --- | --- |
| `/auth/*` | legacy auth fallback | `/auth-policy/auth/*` |
| `/stream/*` | legacy stream compatibility | `/media-control/api/v1/streams*` |
| `/api/v1/map/config` | map config fallback | `/auth-policy/map/config` 후보 |
| `/api/v1/ai/*` | mock AI endpoint | edge AI sidecar 후보 |
| `/metrics` | backend-local metrics | service-local scrape only |
| `/control/*` | legacy control publish | MQTT/gRPC gateway policy 이후 재개 |

## 11. 외부 장비 연동에 필요한 최소 데이터

| 연결 대상 | 필요한 데이터 | 보내는 곳 |
| --- | --- | --- |
| browser/mobile camera publisher | login account, stream id/path, camera permission, microphone permission | `GET /media-control/api/v1/streams/{streamId}/publish` 후 반환된 `whipUrl` |
| external camera/robot gateway | `deviceUuid`, device credential, stream id/path, telemetry schema | `POST /auth-policy/policy/devices/publish`, 이후 gRPC/MQTT/WHIP |
| dashboard receiver | operator account, `Authorization`, stream id, ICE servers | `GET /media-control/api/v1/streams`, `/ice-servers`, `/playback` |
| telemetry ingest | `uuid`/`assetId`, GPS, altitude, heading, speed, battery, timestamp | 현재 `/api/telemetry/`, 목표 gRPC/MQTT |
| command ack | `requestId`/`commandId`, `assetId`, status, observed timestamp | gRPC/MQTT command ack |

미인가 로봇/드론은 media-control publish auth, MediaMTX auth hook, gateway token, group policy를 모두 통과해야 한다.

## 12. 금지 경계

- Dashboard에서 `SakerGatewayService.Exchange`를 직접 호출하지 않는다.
- Dashboard bundle에 MQTT broker credential, gRPC gateway token, TURN long-term secret을 넣지 않는다.
- Media frame을 JSON REST, MQTT, gRPC, GraphQL payload로 직접 전송하지 않는다.
- 운영망에서 `/media-control/metrics`, DB, Redis/DragonFly, MQTT admin, MediaMTX admin API를 public entrypoint로 열지 않는다.
- legacy Python route를 신규 기능의 기본 경로로 쓰지 않는다.
