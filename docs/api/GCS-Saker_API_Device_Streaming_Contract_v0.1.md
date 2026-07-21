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
| 장비 최초 등록 public prefix | `/auth-policy/device-bootstrap` |
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

## Device Bootstrap API

이 API는 로봇, 드론, 휴대폰, edge gateway가 처음 서버에 연결될 때 `deviceUuid`와 최초 device credential을 자동 발급받기 위한 API다.

무제한 공개 등록을 막기 위해 요청에는 서버 운영자가 사전에 배포한 `provisioningToken`이 필요하다. 기본 운영 흐름에서는 관리자 화면의 `운영 설정 > 장비 등록`에서 group에 묶인 일회성 token을 발급하고, 장비 담당자에게 별도 보안 채널로 전달한다.

초기/비상 운영에서는 서버 환경변수로 고정 token을 둘 수도 있다. 이 방식은 재시작 전후 고정값 노출 위험이 있으므로 정식 장비 등록에는 관리자 발급 token을 우선 사용한다.

환경변수 fallback 형식:

```text
AUTH_POLICY_DEVICE_BOOTSTRAP_TOKENS=<token>:<groupId>,<token2>:<groupId2>
```

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| POST | `<EDGE>/auth-policy/device-bootstrap/register` | `/device-bootstrap/register` | provisioning token | 장비 UUID와 최초 credential 자동 발급 |

## Admin Provisioning Token API

운영자가 로봇/드론 최초 등록에 사용할 bootstrap token을 발급하고 조회하는 API다. token 원문은 발급 응답에서만 1회 표시되며, 목록/DB에는 hash와 metadata만 남는다.

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| GET | `<EDGE>/auth-policy/admin/provisioning-tokens` | `/admin/provisioning-tokens` | admin bearer | 발급 이력/상태 조회. token 원문 없음 |
| POST | `<EDGE>/auth-policy/admin/provisioning-tokens` | `/admin/provisioning-tokens` | admin bearer | group에 묶인 bootstrap token 발급 |

발급 요청 body:

```json
{
  "groupId": "co-a",
  "label": "Daegu drone onboarding",
  "ttlMinutes": 60,
  "maxUses": 1
}
```

발급 응답 body:

```json
{
  "tokenId": "<token-id>",
  "token": "<shown-once-provisioning-token>",
  "groupId": "co-a",
  "label": "Daegu drone onboarding",
  "status": "active",
  "maxUses": 1,
  "usedCount": 0,
  "expiresAt": "2026-07-20T02:00:00Z",
  "createdBy": "admin",
  "createdAt": "2026-07-20T01:00:00Z"
}
```

요청 body:

```json
{
  "provisioningToken": "<provisioning-token>",
  "displayName": "Daegu Drone 01",
  "deviceType": "drone",
  "sensors": [
    {
      "sensorId": "gps-main",
      "sensorType": "gps"
    }
  ],
  "streamPaths": [
    {
      "streamPath": "raw/daegu/drone-01",
      "kind": "webrtc"
    }
  ]
}
```

응답 body:

```json
{
  "deviceUuid": "00000000-0000-4000-8000-000000000001",
  "deviceType": "drone",
  "credential": "<device-secret-shown-once>",
  "displayName": "Daegu Drone 01",
  "status": "pending",
  "sensors": [
    {
      "sensorId": "gps-main",
      "sensorType": "gps",
      "status": "active"
    }
  ],
  "streamPaths": [
    {
      "streamPath": "raw/daegu/drone-01",
      "kind": "webrtc",
      "status": "active"
    }
  ]
}
```

요청에는 `groupId`를 넣지 않는다. 서버가 provisioning token에 묶인 group을 원장으로 삼아 `registered_devices.group_id`에 저장한다.

발급 직후 장비 lifecycle status는 `pending`이다. 실제 송출을 허용하려면 관리자가 `<EDGE>/auth-policy/admin/devices/{deviceUuid}/activate`를 호출해 활성화한다.

장비는 응답의 `deviceUuid`와 `credential`을 로컬 secure storage에 저장한다. credential 원문은 서버 DB에 저장하지 않고 hash만 저장한다. credential을 분실하면 관리자 credential rotate API로 재발급한다.

## Device Publish Policy API

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| POST | `<EDGE>/auth-policy/policy/devices/publish` | `/policy/devices/publish` | device credential | 로봇/드론 송출 group 결정 |

요청 body:

```json
{
  "deviceUuid": "device-front-001",
  "credential": "<device-secret>",
  "streamId": "raw.drone01.front",
  "path": "raw/drone01/front"
}
```

응답 body:

```json
{
  "deviceUuid": "device-front-001",
  "streamId": "raw.drone01.front",
  "path": "raw/drone01/front",
  "publisherGroupId": "co-a",
  "reason": "device group authorized",
  "policyVersion": "device-policy-v1"
}
```

요청에는 `groupId`를 넣지 않는다. 서버가 `registered_devices.group_id`를 원장으로 삼아 `publisherGroupId`를 결정한다.

## Admin Device Lifecycle API

이 API는 장비가 직접 호출하는 운용 API가 아니다. 운영자/관리자가 장비를 등록하고 장비에 주입할 UUID와 credential을 발급하기 위한 관리 API다.

| Method | Public URL | 내부 auth-policy route | 인증 | 용도 |
| --- | --- | --- | --- | --- |
| GET | `<EDGE>/auth-policy/admin/devices` | `/admin/devices` | admin bearer | 등록 장비 목록 조회 |
| POST | `<EDGE>/auth-policy/admin/devices` | `/admin/devices` | admin bearer | 장비 UUID와 최초 credential 발급 |
| GET | `<EDGE>/auth-policy/admin/devices/{deviceUuid}` | `/admin/devices/{deviceUuid}` | admin bearer | 등록 장비 단건 조회 |
| PATCH | `<EDGE>/auth-policy/admin/devices/{deviceUuid}` | `/admin/devices/{deviceUuid}` | admin bearer | 장비 표시명, 소속 group, lifecycle status 수정 |
| POST | `<EDGE>/auth-policy/admin/devices/{deviceUuid}/activate` | `/admin/devices/{deviceUuid}/activate` | admin bearer | 장비 송출 활성화 |
| POST | `<EDGE>/auth-policy/admin/devices/{deviceUuid}/disable` | `/admin/devices/{deviceUuid}/disable` | admin bearer | 분실/폐기/차단 장비 비활성화 |
| POST | `<EDGE>/auth-policy/admin/devices/{deviceUuid}/credential` | `/admin/devices/{deviceUuid}/credential` | admin bearer | 장비 credential 재발급 |

등록 요청 body:

```json
{
  "groupId": "co-a",
  "displayName": "Daegu Drone 01",
  "deviceType": "drone",
  "sensors": [
    {
      "sensorId": "gps-main",
      "sensorType": "gps"
    }
  ],
  "streamPaths": [
    {
      "streamPath": "raw/daegu/drone-01",
      "kind": "webrtc"
    }
  ]
}
```

수정 요청 body는 필요한 필드만 보낸다.

```json
{
  "displayName": "Daegu Drone 01 Updated",
  "status": "active"
}
```

목록, 단건 조회, 수정 응답은 `credential`을 포함하지 않는다. credential 원문은 최초 등록과 재발급 응답에만 노출한다.

등록/재발급 응답의 `credential`은 최초 1회만 운영자에게 보여주고, 서버 DB에는 hash만 저장한다.

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
| GET | `<EDGE>/media-control/api/v1/streams/{streamId}/publish` | `/api/v1/streams/{streamId}/publish` | bearer 또는 device credential | short-lived WHIP 송출 URL과 ICE 후보 발급 |
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

4. 응답의 `whipUrl`과 `iceServers`를 사용한다.

```json
{
  "streamId": "raw.local.webcam",
  "whipUrl": "<EDGE>/webrtc/raw/local/webcam/whip?publisherToken=<short-lived-token>",
  "iceServers": [
    { "urls": "stun:a4ai.tplinkdns.com:3478" },
    {
      "urls": "turn:a4ai.tplinkdns.com:3478?transport=udp",
      "username": "<turn-username>",
      "credential": "<turn-credential>"
    }
  ],
  "playbackUrls": {
    "webrtc": "<EDGE>/webrtc/raw/local/webcam/whep?playbackToken=<short-lived-token>",
    "hls": "<EDGE>/hls/raw/local/webcam/index.m3u8?playbackToken=<short-lived-token>"
  }
}
```

`publisherToken`은 stream-scoped short-lived token이다. MediaMTX auth hook은 token의 `streamId`, `path`, signed `groupId` claim, `action=publish`, `exp`, HMAC signature를 검증한다. 장비 송출의 경우 group은 URL이나 stream id에서 받지 않고 auth-policy가 `registered_devices.group_id`로 결정한 값을 media-control이 token claim으로 서명한다. 따라서 token이 노출되어도 다른 stream, 다른 action으로 재사용할 수 없고 만료 시간이 지나면 거부된다.

5. WebRTC publisher가 `iceServers`로 peer connection을 만들고 `whipUrl`로 SDP offer를 POST한다.
6. 송출 중 GPS가 있으면 telemetry ingest API 또는 MQTT/Protobuf telemetry channel로 함께 보낸다.

직접 사용할 수 있는 송출 주소 template:

- 권장: `GET <EDGE>/media-control/api/v1/streams/{streamId}/publish` 후 응답의 `whipUrl`, `iceServers` 사용
- 내부 동작 template: `<EDGE>/webrtc/{streamPath}/whip?publisherToken=<short-lived-token>`
- 예: `<EDGE>/webrtc/raw/local/webcam/whip?publisherToken=<short-lived-token>`
- 금지: 장비가 인증 없이 `/media-control/api/v1/streams/ice-servers`를 별도 호출하는 방식. 장비는 `publish` 응답 안의 `iceServers`를 우선 사용한다.

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

## 외부 로봇 / 드론 WebRTC 송출 흐름

1. 최초 연결 장비는 `<EDGE>/auth-policy/device-bootstrap/register`로 `deviceUuid`와 device credential을 발급받아 안전하게 보관한다.
   - 이미 등록된 장비는 저장된 `deviceUuid`와 device credential을 재사용한다.
   - 관리자가 사전 등록하는 경우 `<EDGE>/auth-policy/admin/devices` 응답의 값을 장비에 주입한다.
2. stream id를 정한다.
   - 예: `raw.drone01.front`
   - Media path: `raw/drone01/front`
3. media-control에 WHIP URL을 요청한다.

```http
GET <EDGE>/media-control/api/v1/streams/raw.drone01.front/publish
X-GCS-Device-UUID: device-front-001
X-GCS-Device-Credential: <device-secret>
```

4. media-control은 내부에서 `<EDGE>/auth-policy/policy/devices/publish`에 `deviceUuid`, `credential`, `streamId`, `path`만 전달한다.
5. auth-policy는 `registered_devices.group_id` 기준으로 `publisherGroupId`를 결정한다. 요청에는 `groupId`를 넣지 않는다.
6. 응답의 `whipUrl`로 WHIP SDP offer를 보낸다.

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
- 로컬 compose와 단일 노드 compose는 media-control 내부 listener를 `:9090`으로 연다.
- `9090/tcp`는 기본 public ingress가 아니며, 외부 브라우저/장비가 직접 호출하는 공개 포트로 열지 않는다.
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
