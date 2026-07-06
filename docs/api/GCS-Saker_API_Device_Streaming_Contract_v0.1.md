# GCS-Saker API / Device / Streaming Contract v0.1

## 원칙

- 외부 공개 진입점은 Nginx/Edge `443` 하나를 기준으로 한다.
- Dashboard, API, media signaling, HLS, WebRTC 경로는 Nginx가 분리한다.
- 외부 로봇, 드론, 휴대폰, 카메라는 backend나 MediaMTX container port에 직접 붙지 않는다.
- 인증이 필요한 HTTP API는 `Authorization: Bearer <accessToken>`을 사용한다.
- 로그인, 회원가입, refresh, logout 같은 상태 변경 요청은 `X-GCS-CSRF: same-origin`을 함께 보낸다.
- WebRTC 송출은 `publish API -> short-lived WHIP URL -> WHIP offer` 순서로 진행한다.
- WebRTC 수신은 `playback API -> short-lived WHEP URL -> WHEP offer` 순서로 진행한다.
- HLS는 fallback이다. 기본 수신 경로는 WebRTC/WHEP다.
- MediaMTX auth callback은 내부 서비스용이다. 외부 장비 연동 문서에는 공개 송출 주소로 제공하지 않는다.

## 기본 주소

| 구분 | 주소 |
| --- | --- |
| 운영 Edge 예시 | `https://a4ai.tplinkdns.com` |
| 로컬 Edge 예시 | `http://localhost:8080` |
| 인증 API public prefix | `/auth-policy/auth` |
| Dashboard REST API public prefix | `/api` |
| Media Control public prefix | `/media-control` |
| WebRTC signaling public prefix | `/webrtc` |
| HLS public prefix | `/hls` |

문서의 `<EDGE>`는 `https://a4ai.tplinkdns.com` 또는 배포 환경의 Nginx 443 주소로 치환한다.

## Auth API

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| POST | `<EDGE>/auth-policy/auth/signup` | `/auth/signup` | no | 초대코드 기반 회원가입 |
| POST | `<EDGE>/auth-policy/auth/login` | `/auth/login` | no | 로그인, access token + httpOnly refresh cookie 발급 |
| POST | `<EDGE>/auth-policy/auth/refresh` | `/auth/refresh` | refresh cookie | access token 재발급 |
| GET | `<EDGE>/auth-policy/auth/me` | `/auth/me` | bearer | 현재 사용자 확인 |
| POST | `<EDGE>/auth-policy/auth/logout` | `/auth/logout` | bearer/cookie | refresh token 폐기 및 cookie 제거 |

필수 header:

- `Authorization: Bearer <accessToken>`: 보호 API 호출 시 사용
- `X-GCS-CSRF: same-origin`: login/signup/refresh/logout 등 상태 변경 요청에 사용
- `Content-Type: application/json`: JSON body 요청에 사용

## Health / Readiness

| Method | Public URL | 내부 route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| GET | `<EDGE>/healthz` | `/healthz` | no | auth-policy API process health |
| GET | `<EDGE>/readyz` | `/readyz` | no | auth-policy dependency readiness |
| GET | `<EDGE>/media-control/healthz` | `/healthz` | no | media-control process health |
| GET | `<EDGE>/media-control/readyz` | `/readyz` | no | media-control dependency readiness |

## Ops / Event / Telemetry API

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| GET | `<EDGE>/api/ops/events` | `/ops/events` | bearer | 이벤트 로그 목록 |
| GET | `<EDGE>/api/ops/events/page` | `/ops/events/page` | bearer | cursor 기반 이벤트 로그 페이지 |
| GET | `<EDGE>/api/ops/events/stream` | `/ops/events/stream` | bearer | 이벤트 SSE stream |
| GET | `<EDGE>/api/ops/events/metrics` | `/ops/events/metrics` | bearer | severity/ICE/stream session 집계 |
| GET | `<EDGE>/api/ops/events/buckets` | `/ops/events/buckets` | bearer | 시간 bucket 집계 |
| GET | `<EDGE>/api/telemetry/all` | `/telemetry/all` | bearer | 접근 가능한 telemetry 최신 목록 |
| POST | `<EDGE>/api/telemetry/` | `/telemetry/` | bearer | 장비 telemetry ingest |
| GET | `<EDGE>/api/telemetry/{uuid}/history` | `/telemetry/{uuid}/history` | bearer | 장비 telemetry history |
| GET | `<EDGE>/api/asset/{gatewayUuid}` | `/asset/{gatewayUuid}` | bearer | gateway 기준 asset 조회 |
| GET | `<EDGE>/api/ops/server-health/snapshots` | `/ops/server-health/snapshots` | bearer | 서버 상태 snapshot 조회 |
| POST | `<EDGE>/api/ops/server-health/snapshots` | `/ops/server-health/snapshots` | bearer | 서버 상태 snapshot ingest |
| GET | `<EDGE>/api/ops/stream-sessions` | `/ops/stream-sessions` | bearer | stream session 조회 |
| POST | `<EDGE>/api/ops/stream-sessions` | `/ops/stream-sessions` | bearer | stream session 상태 ingest |
| GET | `<EDGE>/api/ops/stream-sessions/stream` | `/ops/stream-sessions/stream` | bearer | stream session SSE stream |
| GET | `<EDGE>/api/ops/time/status` | `/ops/time/status` | bearer | 시간 동기화 상태 조회 |
| POST | `<EDGE>/api/ops/time/check` | `/ops/time/check` | bearer | 시간 동기화 즉시 점검 |
| POST | `<EDGE>/api/ops/time/config` | `/ops/time/config` | bearer/operator | 시간 서버 설정 변경 |

## Stream Policy API

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| POST | `<EDGE>/auth-policy/policy/streams/access` | `/policy/streams/access` | bearer | stream 접근 권한 판정 |

이 API는 보통 media-control이 내부적으로 호출한다. 외부 dashboard/device가 직접 호출하는 것을 기본 흐름으로 두지 않는다.

## GraphQL API

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| POST | `<EDGE>/auth-policy/graphql` | `/graphql` | bearer | dashboard read-model 후보 query |

GraphQL은 media path가 아니다. Dashboard 복합 조회가 REST 조합으로 비대해질 때 read-model BFF 후보로만 사용한다.

## Media Control API

| Method | Public URL | 내부 media-control route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| GET | `<EDGE>/media-control/api/v1/streams` | `/api/v1/streams` | bearer | 접근 가능한 stream 목록 |
| GET | `<EDGE>/media-control/api/v1/streams/{streamId}` | `/api/v1/streams/{streamId}` | bearer | stream 단건 정보 |
| GET | `<EDGE>/media-control/api/v1/streams/{streamId}/playback` | `/api/v1/streams/{streamId}/playback` | bearer | short-lived WHEP/HLS 수신 URL 발급 |
| GET | `<EDGE>/media-control/api/v1/streams/{streamId}/publish` | `/api/v1/streams/{streamId}/publish` | bearer/publisher | short-lived WHIP 송출 URL 발급 |
| GET | `<EDGE>/media-control/api/v1/streams/{streamId}/status` | `/api/v1/streams/{streamId}/status` | bearer | stream 상태 조회 |
| GET | `<EDGE>/media-control/api/v1/streams/ice-servers` | `/api/v1/streams/ice-servers` | bearer | STUN/TURN ICE server 목록 조회 |

`streamId` 규칙:

- API에서는 dot 형식 사용: `raw.local.webcam`, `raw.drone01.front`
- MediaMTX path에서는 slash 형식 사용: `raw/local/webcam`, `raw/drone01/front`

## 외부 카메라 / 휴대폰 / 브라우저 송출 흐름

1. 사용자가 로그인한다.
2. 송출 대상 stream id를 정한다.
   - 예: `raw.local.webcam`
   - Media path: `raw/local/webcam`
3. 송출 URL을 요청한다.

```http
GET <EDGE>/media-control/api/v1/streams/raw.local.webcam/publish
Authorization: Bearer <accessToken>
```

4. 응답의 `whipUrl`을 사용한다.

```json
{
  "streamId": "raw.local.webcam",
  "whipUrl": "<EDGE>/webrtc/raw/local/webcam/whip?publisherToken=<short-lived-token>",
  "playbackUrls": {
    "webrtc": "<EDGE>/webrtc/raw/local/webcam/whep?playbackToken=<short-lived-token>",
    "hls": "<EDGE>/hls/raw/local/webcam/index.m3u8?playbackToken=<short-lived-token>"
  }
}
```

5. WebRTC publisher가 `whipUrl`로 SDP offer를 POST한다.
6. 송출 중 GPS가 있으면 telemetry ingest API 또는 MQTT/Protobuf telemetry channel로 함께 보낸다.

직접 사용할 수 있는 송출 주소 template:

- 권장: `GET <EDGE>/media-control/api/v1/streams/{streamId}/publish` 후 응답의 `whipUrl` 사용
- 내부 동작 template: `<EDGE>/webrtc/{streamPath}/whip?publisherToken=<short-lived-token>`
- 예: `<EDGE>/webrtc/raw/local/webcam/whip?publisherToken=<short-lived-token>`

## Dashboard 수신 흐름

1. Dashboard가 stream list를 조회한다.

```http
GET <EDGE>/media-control/api/v1/streams
Authorization: Bearer <accessToken>
```

2. 사용자가 stream을 선택하면 playback URL을 요청한다.

```http
GET <EDGE>/media-control/api/v1/streams/raw.local.webcam/playback
Authorization: Bearer <accessToken>
```

3. WebRTC 우선 수신:

- `<EDGE>/webrtc/{streamPath}/whep?playbackToken=<short-lived-token>`
- `<EDGE>/webrtc/raw/local/webcam/whep?playbackToken=<short-lived-token>`

4. HLS fallback:

- `<EDGE>/hls/{streamPath}/index.m3u8?playbackToken=<short-lived-token>`
- `<EDGE>/hls/raw/local/webcam/index.m3u8?playbackToken=<short-lived-token>`

## 외부 로봇 / 드론 telemetry 연결 방식

### 현재 즉시 사용 가능한 REST 방식

```http
POST <EDGE>/api/telemetry/
Authorization: Bearer <accessToken>
Content-Type: application/json
```

용도:

- GPS 좌표
- 고도
- heading
- battery
- active stream id
- health 상태

REST 방식은 빠른 연동 검증에는 좋지만, 장비 수가 많아지면 MQTT/Protobuf 또는 gRPC gateway로 옮기는 것이 맞다.

### MQTT / Protobuf 후보 방식

Topic template:

```text
gcs/{orgId}/{groupId}/{assetId}/telemetry
```

Payload:

- Protobuf-compatible binary envelope
- `eventId`, `orgId`, `groupId`, `assetId`, `observedUnixMillis`, `receivedUnixMillis`, `latitude`, `longitude`, `altitudeM`, `headingDeg`, `speedMps`, `batteryPercent`, `health`, `activeStreamIds`

운영 원칙:

- MQTT broker port는 기본적으로 내부망/폐쇄망 장비 대역에만 허용한다.
- 공개 인터넷에서는 443/Nginx API를 우선 사용하고, MQTT 직접 공개는 hardened profile 확정 후에만 허용한다.

### gRPC bidirectional streaming 내부/device gateway 방식

용도:

- 장비 gateway/native client
- telemetry
- stream event
- command ack
- backpressure/reconnect response

상태:

- media-control은 내부 gRPC gateway listener를 `MEDIA_CONTROL_GRPC_LISTEN_ADDR`로 실행한다.
- 기본 compose target은 `media-control:9090`이다.
- gateway 인증 metadata는 `x-gcs-gateway-token` 또는 `authorization: bearer <token>`이다.
- method는 `/gcs.saker.v1.SakerGatewayService/Exchange` bidirectional streaming이다.
- payload는 `contracts/proto/gcs/saker/v1/gateway_service.proto`와 호환되는 binary envelope를 사용한다.
- request payload는 `GatewayStreamRequest`의 `telemetry`, `stream_event`, `command_ack` 세 oneof를 계획된 전환 대상으로 고정한다.
- response payload의 `command`, `telemetry_batch`는 서버가 gateway로 내려보내는 제어 응답 후보이며 media frame 전송 경로가 아니다.
- 기존 REST telemetry ingest는 dashboard/legacy 호환과 빠른 현장 연동 fallback으로 유지한다. 신규 장비 gateway와 service-to-service control/data plane은 gRPC/MQTT protobuf 경로를 우선한다.

환경 변수:

```env
CONTROL_GRPC_TARGET=media-control:9090
CONTROL_GRPC_AUTH_TOKEN=<secret>
CONTROL_GRPC_TIMEOUT_SECONDS=2
MEDIA_CONTROL_GRPC_LISTEN_ADDR=:9090
MEDIA_CONTROL_GRPC_TOKEN=<secret>
MEDIA_CONTROL_GRPC_MAX_PAYLOAD_BYTES=65536
```

현재 browser dashboard와의 통신에는 gRPC를 직접 쓰지 않는다. Browser는 HTTPS/JSON/SSE/WHEP/HLS를 사용한다. gRPC는 장비 gateway/native client와 service-to-service control/data plane에만 사용한다.

## Nginx Routing Summary

| Public path | Target service | 목적 |
| --- | --- | --- |
| `/` | dashboard | React dashboard |
| `/auth-policy/*` | auth-policy | 인증/인가/운영 API |
| `/api/asset/*` | auth-policy | legacy-compatible asset route |
| `/api/telemetry/*` | auth-policy | telemetry route |
| `/api/ops/*` | auth-policy | ops/event/time route |
| `/media-control/*` | media-control | stream registry, ICE, publish/playback URL |
| `/webrtc/*` | MediaMTX WebRTC | WHIP/WHEP signaling |
| `/hls/*` | MediaMTX HLS | HLS fallback |
| `/ws/*` | backend legacy/future websocket | future path |

## 외부 연동 체크리스트

- 장비가 직접 `3000`, `8001`, `8888`, `8889`로 붙지 않는다.
- 외부 공개는 `<EDGE>:443`만 기본으로 둔다.
- WebRTC ICE 실패 시에만 TURN relay port 정책을 점검한다.
- 송출 장비는 먼저 인증하고 publish URL을 발급받는다.
- 송출/수신 URL에는 short-lived token이 붙어야 한다.
- token, password, private key는 로그/문서/PR에 남기지 않는다.
