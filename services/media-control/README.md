# GCS-Saker Media Control Service

Go 기반 media-control PoC 서비스다.

## 역할

- MediaMTX API adapter
- stream registry contract
- coturn primary/secondary health 기반 ICE server contract
- dashboard 호환 stream list/playback/status contract
- Spring/Kotlin auth-policy stream access decision 연동
- media plane 상태 조회

## 원칙

- media packet을 직접 처리하지 않는다.
- WebRTC/WHEP/HLS는 MediaMTX와 coturn이 담당한다.
- 이 서비스는 control plane으로 stream/ICE 상태를 API 형태로 제공한다.
- `/api/v1/streams` 계열은 bearer token을 auth-policy로 전달해 stream별 접근 권한을 확인한다.

## Dashboard cutover endpoints

```text
GET /api/v1/streams
GET /api/v1/streams/ice-servers
GET /api/v1/streams/{streamId}
GET /api/v1/streams/{streamId}/playback
GET /api/v1/streams/{streamId}/status
```

Nginx edge에서는 `/media-control/` prefix로 이 서비스를 노출한다. Dashboard는 `VITE_STREAM_API_BASE_URL=/media-control`일 때 Go media-control을 사용하고, 기본 `/api`일 때 기존 Python stream API를 사용한다.

## Auth-policy 연동

`AUTH_POLICY_BASE_URL`이 설정되면 media-control은 stream list/detail/playback/status 요청마다 `Authorization` header를 Spring/Kotlin auth-policy의 `POST /policy/streams/access`로 전달한다.

- 인증 실패: `401`
- 권한 없는 단건 stream: `403`
- 권한 없는 목록 stream: 목록에서 제외
- `AUTH_POLICY_BASE_URL` 미설정: 로컬 legacy 호환을 위해 allow-all

stream의 발행 group은 `MEDIA_CONTROL_STREAM_GROUP_MAP`의 `path=group` 매핑을 우선 사용하고, 매핑이 없으면 `MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID`를 사용한다.

## 테스트

```bash
go test ./...
go test ./... -cover
```
