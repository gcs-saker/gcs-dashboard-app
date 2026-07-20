# GCS-Saker Robot/Drone Integration TODO

작성일: 2026-07-20

이 문서는 로봇/드론 담당자가 GCS-Saker 서버에 장비를 붙이기 위해 구현해야 하는 일을 정리한 체크리스트입니다.

실제 `provisioningToken`, `device credential`, 운영자 토큰, 서버 private 값은 이 문서에 적지 않습니다. 해당 값은 운영자가 별도 보안 채널로 전달해야 합니다.

## 1. 전체 연결 흐름

```text
장비 최초 실행
  -> bootstrap API 호출
  -> server-issued deviceUuid / credential 저장
  -> 관리자가 장비 activate
  -> publish URL 발급 요청
  -> 응답 whipUrl로 WebRTC WHIP 송출
  -> 끊기면 bootstrap이 아니라 publish URL부터 다시 발급
```

## 2. 장비가 저장해야 하는 값

장비는 최초 등록 이후 아래 값을 안전하게 저장해야 합니다.

| 값 | 설명 | 저장 위치 권장 |
| --- | --- | --- |
| `deviceUuid` | 서버가 자동 발급한 장비 식별자 | 장비 persistent config |
| `credential` | 장비 인증용 secret. 서버 DB에는 hash로 저장됨 | 암호화 저장소, TPM, secure storage 권장 |
| `streamId` | 송출할 stream 식별자. 예: `raw.drone-01.front` | 장비 설정 |
| `streamPath` | MediaMTX 경로. 예: `raw/drone-01/front` | 장비 설정 |

주의:

- `groupId`는 장비 요청 URL이나 body에 넣지 않습니다.
- 장비의 group은 서버가 `provisioningToken -> group` 또는 장비 등록 정보로 결정합니다.
- `credential`은 로그, 화면, crash dump, plain text export에 남기지 않습니다.

## 3. 최초 UUID 자동 발급

장비에 저장된 `deviceUuid`와 `credential`이 없을 때만 호출합니다.

`provisioningToken`은 로봇 담당자가 직접 생성하지 않습니다. 서버 운영자가 관리자 계정으로 대시보드에 로그인한 뒤 `운영 설정 > 장비 등록`에서 group, label, 만료 시간, 사용 횟수를 지정해 발급하고, 발급 화면에 한 번만 표시되는 token을 별도 보안 채널로 전달합니다.

API로 발급할 때는 운영자만 아래 경로를 호출합니다.

```http
POST https://a4ai.tplinkdns.com/auth-policy/admin/provisioning-tokens
Authorization: Bearer <admin-access-token>
Content-Type: application/json
```

```json
{
  "groupId": "co-a",
  "label": "Daegu drone onboarding",
  "ttlMinutes": 60,
  "maxUses": 1
}
```

발급 응답의 `token`은 최초 1회만 확인할 수 있습니다. 로봇 담당자는 전달받은 token을 아래 bootstrap 요청에만 사용합니다.

```http
POST https://a4ai.tplinkdns.com/auth-policy/device-bootstrap/register
Content-Type: application/json
```

요청 예시:

```json
{
  "provisioningToken": "<운영자가 별도 전달>",
  "displayName": "drone-01-front",
  "deviceType": "drone",
  "sensors": ["camera", "gps"],
  "streamPaths": [
    {
      "streamPath": "raw/drone-01/front",
      "kind": "webrtc"
    }
  ]
}
```

응답 예시:

```json
{
  "deviceUuid": "<server-issued-uuid>",
  "deviceType": "drone",
  "credential": "<device-secret>",
  "displayName": "drone-01-front",
  "status": "pending",
  "sensors": ["camera", "gps"],
  "streamPaths": [
    {
      "streamPath": "raw/drone-01/front",
      "kind": "webrtc"
    }
  ]
}
```

담당자 구현 TODO:

- 장비에 저장된 `deviceUuid`/`credential` 존재 여부 확인 로직 작성
- 없을 때만 bootstrap API 호출
- 응답의 `deviceUuid`와 `credential`을 안전 저장
- `status=pending`이면 송출 재시도만 반복하지 말고 "관리자 승인 대기" 상태 표시
- 같은 장비가 재시작될 때 bootstrap을 반복 호출하지 않도록 보호

## 4. 관리자 활성화 대기

bootstrap 직후 장비 상태는 기본적으로 `pending`입니다.

관리자가 장비를 확인한 뒤 activate해야 실제 송출 권한이 열립니다.

관리자용 API:

```http
POST https://a4ai.tplinkdns.com/auth-policy/admin/devices/{deviceUuid}/activate
Authorization: Bearer <admin-access-token>
```

로봇 담당자는 이 API를 직접 호출하지 않는 것을 기본으로 합니다. 장비 쪽에서는 송출 권한이 아직 없을 수 있다는 상태만 처리하면 됩니다.

## 5. WebRTC 송출 URL 발급

장비가 활성화된 뒤, 송출 시작 직전에 publish URL을 발급받습니다.

```http
GET https://a4ai.tplinkdns.com/media-control/api/v1/streams/{streamId}/publish
X-GCS-Device-UUID: <deviceUuid>
X-GCS-Device-Credential: <credential>
```

예시:

```http
GET https://a4ai.tplinkdns.com/media-control/api/v1/streams/raw.drone-01.front/publish
X-GCS-Device-UUID: <server-issued-uuid>
X-GCS-Device-Credential: <device-secret>
```

응답에는 `whipUrl`이 포함됩니다.

```json
{
  "streamId": "raw.drone-01.front",
  "whipUrl": "https://a4ai.tplinkdns.com/webrtc/raw/drone-01/front/whip?publisherToken=<short-lived-token>"
}
```

담당자 구현 TODO:

- 송출 시작 직전에 publish API 호출
- 응답의 `whipUrl`을 그대로 사용
- `/webrtc/.../whip` 주소와 `publisherToken`을 장비에서 임의 생성하지 않기
- `publisherToken`은 짧은 수명의 송출 토큰이므로, 실패/만료 시 publish API를 다시 호출

## 6. WHIP 송출

publish API가 반환한 `whipUrl`로 SDP offer를 전송합니다.

```http
POST <whipUrl>
Content-Type: application/sdp
```

요청 body:

```text
<WebRTC SDP offer>
```

담당자 구현 TODO:

- 장비 카메라/인코더에서 WebRTC offer 생성
- publish API 응답의 `whipUrl`로 WHIP POST
- SDP answer를 받아 PeerConnection에 적용
- ICE candidate 수집 및 연결 상태를 로그로 남김
- 연결 실패 시 일정 횟수 backoff 후 publish URL 재발급부터 재시도

## 7. GPS/Telemetry 전송

현재 media frame은 WebRTC로 보내고, GPS/health/ACK 같은 데이터는 control/data plane으로 분리하는 방향입니다.

담당자 구현 TODO:

- 영상 프레임에 GPS를 섞어 보내지 않기
- GPS, battery, heading, network 상태를 별도 telemetry payload로 분리
- 장비 시간 기준을 서버 시간과 맞출 수 있도록 timestamp 포함
- 추후 MQTT/Protobuf 계약이 확정되면 해당 topic/payload로 전환할 수 있게 telemetry 모듈을 분리

## 8. 오류 처리 기준

| HTTP status | 의미 | 장비 동작 |
| --- | --- | --- |
| `400` | 요청 JSON/필드 형식 오류 | 요청 payload 점검, 재시도 남발 금지 |
| `401` | 인증 정보 없음 또는 edge/security filter 차단 | credential/header 포함 여부 확인 |
| `403` | provisioning token 오류, credential 오류, 비활성 장비 | 운영자 확인 필요 |
| `404` | stream route/path 오류 | `streamId`, `streamPath` 매핑 확인 |
| `429` | bootstrap 또는 publish 요청 과다 | 지수 backoff |
| `5xx` | 서버/중계 일시 장애 | 짧은 재시도 후 backoff |

## 9. 보안 요구사항

담당자 구현 TODO:

- `credential`과 `provisioningToken`을 로그에 남기지 않기
- 장비 설정 export에 secret 포함하지 않기
- bootstrap token은 최초 등록 또는 재등록 때만 사용
- 장비 분실/폐기 시 운영자에게 `disable` 또는 credential rotate 요청
- TLS 인증서 경고가 있는 환경에서는 운영자가 제공한 인증서/CA trust 설정을 적용

## 10. 재연결 정책

권장 재연결 순서:

```text
WebRTC 연결 끊김 감지
  -> 현재 PeerConnection 정리
  -> 기존 deviceUuid/credential 유지
  -> publish URL 재발급
  -> 새 whipUrl로 WHIP 송출
  -> 실패 시 backoff
```

주의:

- 연결이 끊겼다고 bootstrap을 다시 호출하지 않습니다.
- `deviceUuid`를 새로 받으면 운영자가 같은 장비를 중복 장비로 보게 됩니다.

## 11. 최소 구현 예시

```pseudo
identity = secureStore.loadDeviceIdentity()

if identity is missing:
    response = POST /auth-policy/device-bootstrap/register
    secureStore.save(response.deviceUuid, response.credential)
    stop until operator activates device

publishResponse = GET /media-control/api/v1/streams/{streamId}/publish
    headers:
        X-GCS-Device-UUID = identity.deviceUuid
        X-GCS-Device-Credential = identity.credential

peer = createWebRtcPeerConnection()
offer = peer.createOffer()
answer = POST publishResponse.whipUrl with application/sdp body
peer.setRemoteDescription(answer)

on disconnect:
    cleanup peer
    retry from publish URL request
```

## 12. 담당자 체크리스트

- [ ] 장비 secure storage 준비
- [ ] 최초 bootstrap API 호출 구현
- [ ] `deviceUuid`/`credential` 저장 구현
- [ ] pending/active/denied 상태별 UI 또는 로그 처리
- [ ] publish URL 발급 구현
- [ ] WHIP POST 송출 구현
- [ ] ICE 연결 상태 로그 구현
- [ ] 끊김 감지 후 publish URL 재발급 재연결 구현
- [ ] GPS/health telemetry 모듈 분리
- [ ] secret 로그 마스킹 처리
- [ ] 운영자가 관리자 화면 또는 admin API로 provisioning token 발급
- [ ] 서버 담당자와 실제 provisioning token 전달 보안 채널 합의

## 13. 관련 문서

- [GCS-Saker API Device Streaming Contract](./GCS-Saker_API_Device_Streaming_Contract_v0.1.md)
- [GCS-Saker Device Authentication Guide](./GCS-Saker_Device_Authentication_Guide.md)
- [GCS-Saker API Swagger Style Table](./GCS-Saker_API_Swagger_Style_Table.md)
