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

## Legacy compatibility endpoint

```text
GET /stream/status
```

M7 runtime smoke와 예전 운영 체크 호환을 위해 `/stream/status`는 `{"stream":"ready"}`를 계속 반환한다. 다만 이 경로는 legacy compatibility endpoint이므로 `Deprecation: true`와 `X-GCS-Replacement-Route: /media-control/api/v1/streams` header를 함께 내려준다. 신규 운영 체크와 dashboard stream 조회는 `/media-control/api/v1/streams*`를 사용한다.

## Auth-policy 연동

`AUTH_POLICY_BASE_URL`이 설정되면 media-control은 stream list/detail/playback/status 요청마다 `Authorization` header를 Spring/Kotlin auth-policy의 `POST /policy/streams/access`로 전달한다.

- 인증 실패: `401`
- 권한 없는 단건 stream: `403`
- 권한 없는 목록 stream: 목록에서 제외
- `AUTH_POLICY_BASE_URL` 미설정: 로컬 legacy 호환을 위해 allow-all

stream의 발행 group은 `MEDIA_CONTROL_STREAM_GROUP_MAP`의 `path=group` 매핑을 우선 사용하고, 매핑이 없으면 `MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID`를 사용한다.

## ICE URL

외부 브라우저에 전달하는 ICE 후보 URL은 `MEDIA_CONTROL_STUN_URL`, `MEDIA_CONTROL_TURN_PRIMARY_URL`, `MEDIA_CONTROL_TURN_SECONDARY_URL`로 주입한다. 서버 운영 환경에서는 Docker 내부 hostname이 아니라 public DNS 또는 폐쇄망 VIP를 사용해야 한다.

TURN relay allocation 부하를 줄이기 위해 media-control은 기본적으로 건강한 TURN 서버를 1개만 ICE API에 포함한다. STUN 후보는 그대로 전달하고, primary TURN이 건강하지 않을 때 secondary TURN이 선택된다. 운영자가 장애 전환보다 동시 후보 제공을 우선해야 하는 환경에서는 `MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS`를 늘릴 수 있지만, 브라우저가 여러 TURN allocation을 만들 수 있으므로 기본값 `1`을 권장한다.

`MEDIA_CONTROL_REDIS_ADDR`가 설정되면 ICE 서버 목록은 `MEDIA_CONTROL_ICE_SERVER_CACHE_KEY`에 짧게 캐시된다. 기본 TTL은 `MEDIA_CONTROL_ICE_SERVER_CACHE_TTL_SECONDS=10`이며, Redis 장애 시에는 캐시만 degraded 처리하고 upstream registry를 직접 사용한다. ICE 서버 목록에는 TURN credential이 포함될 수 있으므로 Redis는 내부망, 인증, 방화벽 뒤에서만 운용한다.

## 테스트

```bash
go test ./...
go test ./... -cover
```
