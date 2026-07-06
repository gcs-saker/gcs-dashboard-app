# GCS-Saker Device Authentication Guide

이 문서는 외부 카메라, 휴대폰, 로봇, 드론, 장비 gateway가 GCS-Saker에 안전하게 붙는 방법을 설명한다.

## 1. 장비 연결 경로

| 장비 유형 | 권장 연결 경로 | 인증 방식 | 목적 |
| --- | --- | --- | --- |
| Browser/mobile camera publisher | `GET /media-control/api/v1/streams/{streamId}/publish` 후 반환된 `whipUrl` | operator/publisher bearer token, short-lived `publisherToken` | WebRTC WHIP 송출 |
| Dashboard receiver | `GET /media-control/api/v1/streams/{streamId}/playback` 후 반환된 `playbackUrls.webrtc` | operator bearer token, short-lived `playbackToken` | WebRTC WHEP 수신 |
| Robot/drone gateway | `POST /auth-policy/policy/devices/publish` 후 gateway-managed WHIP | device UUID, device credential | 송출 group 결정, telemetry, stream event, command ack |
| MQTT device | `gcs/{orgId}/{groupId}/{assetId}/telemetry` | broker credential, device policy | 대량 telemetry ingest |

브라우저는 gRPC/MQTT에 직접 연결하지 않는다. 브라우저는 HTTPS JSON, SSE, WHIP, WHEP, HLS만 사용한다.

## 2. Browser / Mobile Publisher 절차

| Step | 호출 | 필요한 값 | 결과 |
| --- | --- | --- | --- |
| 1 | `POST /auth-policy/auth/login` | `username`, `password` | `accessToken`, httpOnly refresh cookie |
| 2 | `GET /media-control/api/v1/streams/{streamId}/publish` | `Authorization: Bearer <accessToken>` | short-lived `whipUrl` |
| 3 | `POST /webrtc/{streamPath}/whip?publisherToken=...` | SDP offer | WHIP session 생성 |
| 4 | telemetry 전송 | GPS, heading, speed, battery, timestamp | 지도/telemetry panel 반영 |

`streamId`는 API에서 `raw.local.webcam`처럼 dot 형식을 사용하고, `streamPath`는 MediaMTX에서 `raw/local/webcam`처럼 slash 형식을 사용한다.

## 3. WHIP Publisher Token Claim

media-control이 발급하는 `publisherToken`은 HMAC 서명된 short-lived token이다.

| Claim | 의미 | 검증 위치 |
| --- | --- | --- |
| `streamId` | API stream id, 예: `raw.local.webcam` | MediaMTX auth hook |
| `path` | MediaMTX stream path, 예: `raw/local/webcam` | MediaMTX auth hook |
| `groupId` | stream publish group, 예: `co-a` | MediaMTX auth hook |
| `action` | `publish` | MediaMTX auth hook |
| `exp` | 만료 Unix timestamp | MediaMTX auth hook |
| signature | signing secret 기반 HMAC-SHA256 | MediaMTX auth hook |

검증 실패 조건:

- token 없음
- token 변조
- `streamId` 불일치
- `path` 불일치
- `groupId` 불일치
- `action` 불일치
- 만료 시간 초과

## 4. Group Authorization

stream group은 media-control의 `StreamGroupResolver`가 계산한다.

| 설정 | 의미 |
| --- | --- |
| `MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID` | mapping이 없는 stream의 기본 publisher group |
| `MEDIA_CONTROL_STREAM_GROUP_MAP` | `path=group` 또는 `streamId=group` mapping |

예:

```env
MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID=co-a
MEDIA_CONTROL_STREAM_GROUP_MAP=raw/company-b/front=co-b
```

위 설정에서 `raw/company-b/front`에 대해 co-a token으로 publish하면 MediaMTX auth hook이 거부한다.

## 5. Robot / Drone Gateway 절차

| Step | 연결 | 필요한 값 | 결과 |
| --- | --- | --- | --- |
| 1 | device 등록 | `deviceUuid`, optional `macHash`, `groupId`, credential hash | 장비 식별 기준 확보 |
| 2 | publish group 인가 | `deviceUuid`, device credential, `streamId`, `path` | 서버가 `publisherGroupId` 결정 |
| 3 | gRPC 또는 MQTT 연결 | gateway token 또는 broker credential | telemetry/control channel 생성 |
| 4 | stream 송출 | device policy를 통과한 gateway-managed WHIP URL | MediaMTX publish |
| 5 | telemetry/ack 송신 | Protobuf payload | dashboard read model 반영 |

장비 publish group 인가 요청:

```http
POST /auth-policy/policy/devices/publish
Content-Type: application/json
```

```json
{
  "deviceUuid": "device-front-001",
  "credential": "<device-secret>",
  "streamId": "raw.drone01.front",
  "path": "raw/drone01/front"
}
```

요청에는 `groupId`를 넣지 않는다. 서버는 `registered_devices.group_id`를 기준으로 응답의 `publisherGroupId`를 결정한다.

장비의 long-lived credential은 장비 secure storage 또는 gateway secret store에 보관한다. 브라우저 bundle이나 문서에 넣지 않는다.

## 6. 운영 주의사항

- `publisherToken`과 `playbackToken`은 URL query에 포함되므로 수명을 짧게 유지한다.
- access log에 query string을 남기는 경우 masking 정책을 적용한다.
- token signing secret은 `MEDIA_CONTROL_PUBLISH_TOKEN`으로 주입하되, URL에 직접 노출하지 않는다.
- 미인가 장비 차단은 bearer 권한, group policy, stream-scoped media token, MediaMTX auth hook을 모두 통과해야 한다.
- token이 유출되어도 blast radius는 특정 `streamId/path/groupId/action/expiry`로 제한된다.
