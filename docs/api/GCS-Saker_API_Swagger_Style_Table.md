# GCS-Saker API Swagger-Style Table

이 문서는 Swagger UI처럼 협업자가 endpoint별 요청/응답 계약을 빠르게 훑어볼 수 있도록 구성한 표다. 실제 Swagger/OpenAPI 서버를 추가하지 않는다.

## 읽는 법

| 컬럼 | 의미 |
| --- | --- |
| Method | HTTP method 또는 signaling 방식 |
| Path | Nginx 443 public edge 기준 URL |
| Auth | 필요한 인증 |
| Headers | 필수/권장 header |
| Params | path/query parameter |
| Body | request body 핵심 필드 |
| Response | response 핵심 필드 |
| Notes | 운영/보안/프로토콜 주의사항 |

공통 기준:

- 보호 API는 `Authorization: Bearer <accessToken>`을 사용한다.
- browser write 요청은 `X-GCS-CSRF: same-origin`을 사용한다.
- 장애 분석을 위해 `traceparent`, `tracestate`, `X-GCS-Trace-Id`를 연결한다.
- refresh token, TURN credential, media token signing secret, gateway token은 문서/PR/브라우저 bundle에 노출하지 않는다.

## Auth

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth-policy/auth/signup` | none | `Content-Type: application/json`, `X-GCS-CSRF` | none | `username`, `password`, `email`, `inviteCode`, optional `displayName`, `groupId` | `user`, `accessToken`, `tokenType`, `expiresInSeconds` | 초대 코드 정책 필요 |
| POST | `/auth-policy/auth/login` | none | `Content-Type: application/json`, `X-GCS-CSRF` | none | `username`, `password` | `user`, `accessToken`, `tokenType`, `expiresInSeconds` | refresh token은 httpOnly cookie |
| POST | `/auth-policy/auth/refresh` | refresh cookie | `X-GCS-CSRF` | none | none | `accessToken`, `tokenType`, `expiresInSeconds` | access token 재발급 |
| GET | `/auth-policy/auth/me` | bearer | `Authorization` | none | none | `username`, `role`, `groupId`, `permissions` | URL 직접 진입 guard 기준 |
| POST | `/auth-policy/auth/logout` | bearer + refresh cookie | `Authorization`, `X-GCS-CSRF` | none | none | empty/ok | refresh session 폐기 |

## Health / Readiness

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/healthz` | none | none | none | none | `status`, `service` | auth-policy liveness |
| GET | `/readyz` | none | none | none | none | `status`, `checks[]` | auth-policy readiness |
| GET | `/media-control/healthz` | none | none | none | none | `status`, `service` | media-control liveness |
| GET | `/media-control/readyz` | none | none | none | none | `status`, `checks[]` | stream registry, ICE, gRPC readiness |

## Operational / Event

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/ops/events` | bearer | `Authorization` | optional `severity`, `from`, `to`, `q` | none | `events[]` | 이벤트 로그 목록 |
| GET | `/api/ops/events/page` | bearer | `Authorization` | `page`, `size`, optional filters | none | `items[]`, `page`, `size`, `total` | 이벤트 로그 paging |
| GET | `/api/ops/events/stream` | bearer | `Authorization`, `Accept: text/event-stream` | none | none | SSE event stream | 실시간 이벤트 표시 |
| GET | `/api/ops/events/metrics` | bearer | `Authorization` | optional `from`, `to` | none | `severityCounts[]`, `icePathCounts[]`, `streamSessionMetrics[]` | 운영 그래프 |
| GET | `/api/ops/events/buckets` | bearer | `Authorization` | optional `from`, `to` | none | `bucketStart`, `count` | 타임라인 그래프 |
| GET | `/api/ops/server-health/snapshots` | bearer | `Authorization` | optional time range | none | `service`, `status`, `rttMs`, `observedAt` | 서버 상태 화면 |
| POST | `/api/ops/server-health/snapshots` | bearer | `Authorization`, `Content-Type: application/json` | none | `service`, `status`, `rttMs`, `observedAt` | saved snapshot | 운영 상태 ingest |
| GET | `/api/ops/stream-sessions` | bearer | `Authorization` | optional filters | none | `streamId`, `assetId`, `status`, `icePath`, `lastSeenAt` | 수신 가능한 stream 목록 |
| POST | `/api/ops/stream-sessions` | bearer | `Authorization`, `Content-Type: application/json` | none | stream session descriptor | saved stream session | stream 연결/해제 감지 |
| GET | `/api/ops/stream-sessions/stream` | bearer | `Authorization`, `Accept: text/event-stream` | none | none | SSE heartbeat/session event | dashboard 실시간 반영 |

## Telemetry / Asset

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/telemetry/all` | bearer | `Authorization` | none | none | telemetry list | dashboard telemetry table |
| POST | `/api/telemetry/` | bearer | `Authorization`, `Content-Type: application/json` | none | `uuid`, `streamId`, `latitude`, `longitude`, `altitudeM`, `headingDeg`, `speedMps`, `batteryPercent`, `observedAt` | saved telemetry | REST 호환 경로, 대량 ingest는 MQTT/gRPC 후보 |
| GET | `/api/telemetry/{uuid}/history` | bearer | `Authorization` | path `uuid` | none | telemetry history | 선택 stream geometry/telemetry |
| GET | `/api/asset/{gatewayUuid}` | bearer | `Authorization` | path `gatewayUuid` | none | `gatewayUuid`, `assetId`, `displayName`, `status` | 자산 트리 표시 |

## Time Sync

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/ops/time/status` | bearer | `Authorization` | none | none | `mode`, `server`, `status`, `offsetMs`, `checkedAt` | 시간 동기화 상태 |
| POST | `/api/ops/time/check` | bearer | `Authorization`, `X-GCS-CSRF` | none | optional target server | check result | 시간 서버 즉시 점검 |
| PUT | `/api/ops/time/config` | bearer | `Authorization`, `X-GCS-CSRF`, `Content-Type: application/json` | none | `mode`, optional `server` | active config/status | 공개망/폐쇄망 시간 서버 설정 |

## Media Control

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/media-control/api/v1/streams` | bearer | `Authorization` | none | none | `streams[]` | 접근 가능한 stream registry |
| GET | `/media-control/api/v1/streams/ice-servers` | bearer | `Authorization` | none | none | `iceServers[]` | STUN 우선, TURN fallback 후보 |
| GET | `/media-control/api/v1/streams/{streamId}` | bearer | `Authorization` | path `streamId` | none | stream descriptor | 단건 stream 정보 |
| GET | `/media-control/api/v1/streams/{streamId}/playback` | bearer | `Authorization` | path `streamId` | none | `streamId`, `status`, `playbackUrls.webrtc`, `playbackUrls.hls` | dashboard 수신 URL 발급 |
| GET | `/media-control/api/v1/streams/{streamId}/publish` | bearer 또는 device credential | `Authorization` 또는 `X-GCS-Device-UUID`, `X-GCS-Device-Credential` | path `streamId` | none | `streamId`, `whipUrl` | browser/mobile publisher 또는 robot/drone gateway 송출 URL 발급 |
| GET | `/media-control/api/v1/streams/{streamId}/status` | bearer | `Authorization` | path `streamId` | none | `streamId`, `status` | 연결 상태 확인 |

`streamId`는 API에서는 `raw.local.webcam` 같은 dot 형식, MediaMTX path에서는 `raw/local/webcam` 같은 slash 형식을 사용한다.

`publish` 응답의 `whipUrl`에는 short-lived `publisherToken`이 포함된다. 이 token은 `streamId`, `path`, signed `groupId` claim, `action=publish`, `exp`, HMAC signature에 묶인다. 장비 요청은 media-control이 auth-policy device publish policy를 내부 호출하므로 request body나 URL에 `groupId`를 싣지 않는다.

## WebRTC / HLS Media Plane

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WHIP POST | `/webrtc/{streamPath}/whip` | short-lived `publisherToken` | `Content-Type: application/sdp` | path `streamPath`, query `publisherToken` | SDP offer | SDP answer / session created | 송출. publish API가 반환한 URL 사용 |
| WHEP POST | `/webrtc/{streamPath}/whep` | short-lived `playbackToken` | `Content-Type: application/sdp` | path `streamPath`, query `playbackToken` | SDP offer | SDP answer / session created | 수신. playback API가 반환한 URL 사용 |
| HLS GET | `/hls/{streamPath}/index.m3u8` | short-lived `playbackToken` | none | path `streamPath`, query `playbackToken` | none | HLS playlist | WebRTC 실패 시 fallback |

media frame은 WebRTC/HLS media plane으로만 보낸다. JSON, MQTT, gRPC, GraphQL payload에 video/audio frame을 직접 태우지 않는다.

## Stream Policy

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth-policy/policy/streams/access` | bearer | `Authorization`, `Content-Type: application/json` | none | `streamId`, `path`, `publisherGroupId`, optional `startedAt` | `allowed`, `reason`, `principalId`, `groupId`, `expiresAt`, `permissions[]` | 일반 외부 호출보다 media-control 내부 권한 질의가 기본 |

## Device Publish Policy

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth-policy/policy/devices/publish` | device credential | `Content-Type: application/json` | none | `deviceUuid`, `credential`, `streamId`, `path` | `deviceUuid`, `streamId`, `path`, `publisherGroupId`, `policyVersion` | 요청 body에 `groupId`를 넣지 않는다. 서버가 등록 장비 group을 결정한다. |

## Admin Device Lifecycle

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth-policy/admin/devices` | admin bearer | `Authorization`, `Content-Type: application/json` | none | `groupId`, `displayName` | `deviceUuid`, `credential`, `groupId`, `displayName`, `status` | credential 원문은 최초 1회 응답에만 표시하고 DB에는 hash만 저장 |
| POST | `/auth-policy/admin/devices/{deviceUuid}/activate` | admin bearer | `Authorization` | path `deviceUuid` | none | `deviceUuid`, `groupId`, `displayName`, `status` | PENDING/DISABLED 장비를 ACTIVE로 전환 |
| POST | `/auth-policy/admin/devices/{deviceUuid}/disable` | admin bearer | `Authorization` | path `deviceUuid` | none | `deviceUuid`, `groupId`, `displayName`, `status` | 분실/폐기/침해 의심 장비 차단 |
| POST | `/auth-policy/admin/devices/{deviceUuid}/credential` | admin bearer | `Authorization` | path `deviceUuid` | none | `deviceUuid`, `credential`, `groupId`, `displayName`, `status` | 기존 credential을 폐기하고 새 credential 발급 |

## Legacy / Fallback

| Method | Path | Auth | Headers | Params | Body | Response | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/stream/status` | none | none | none | none | `stream`, `service`, `status`, `deprecated`, `replacement` | legacy smoke only. replacement는 `/media-control/api/v1/streams` |
| GET | `/api/v1/map/config` | bearer | `Authorization` | none | none | `provider`, `styleUrl`, `attribution`, `requiresApiKey` | auth-policy read model로 이전 예정 |
| `/auth/*` | legacy | varies | varies | varies | varies | varies | 신규 기본 경로는 `/auth-policy/auth/*` |
| `/control/*` | disabled/fallback | policy 필요 | varies | varies | varies | varies | MQTT/gRPC gateway policy 이후 재개 |

## Device / Gateway Non-HTTP Boundary

이 섹션은 Swagger-style 표에 함께 넣되, 브라우저 호출 API가 아니라 장비 gateway 계약이다.

| Protocol | Address / Topic | Auth | Required Data | Response / Ack | Notes |
| --- | --- | --- | --- | --- | --- |
| gRPC bidi | `/gcs.saker.v1.SakerGatewayService/Exchange` | `x-gcs-gateway-token`, `authorization: bearer <token>` | `requestId`, `orgId`, `groupId`, `assetId`, payload kind | `accepted`, `rejected`, `backpressure`, `reconnect` | browser 직접 연결 금지 |
| MQTT publish | `gcs/{orgId}/{groupId}/{assetId}/telemetry` | broker credential / device policy | telemetry Protobuf payload | broker ack | telemetry ingest 후보 |
| MQTT publish | `gcs/{orgId}/{groupId}/{assetId}/command_ack` | broker credential / device policy | command id, status, observed time | broker ack | command ack 후보 |
| MQTT subscribe | `gcs/{orgId}/{groupId}/{assetId}/command` | broker credential / device policy | none | command Protobuf payload | device command 후보 |

## External Integration Quick Flow

| Flow | Step | Call | Required Data | Result |
| --- | --- | --- | --- | --- |
| Dashboard login | 1 | `POST /auth-policy/auth/login` | `username`, `password` | `accessToken` |
| Dashboard receive | 2 | `GET /media-control/api/v1/streams` | bearer | 선택 가능한 stream 목록 |
| Dashboard receive | 3 | `GET /media-control/api/v1/streams/ice-servers` | bearer | ICE 후보 |
| Dashboard receive | 4 | `GET /media-control/api/v1/streams/{streamId}/playback` | bearer, `streamId` | WHEP/HLS URL |
| Publisher send | 1 | `GET /media-control/api/v1/streams/{streamId}/publish` | bearer, `streamId` | WHIP URL |
| Publisher send | 2 | `POST /webrtc/{streamPath}/whip` | `publisherToken`, SDP offer | WebRTC 송출 시작 |
| Device telemetry | 1 | `POST /api/telemetry/` 또는 MQTT/gRPC | GPS, health, stream id, timestamp | 지도/telemetry 반영 |
