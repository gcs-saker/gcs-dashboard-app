# GCS-Saker Media Control Service

Go 기반 media-control PoC 서비스다.

## 역할

- MediaMTX API adapter
- stream registry contract
- coturn primary/secondary health 기반 ICE server contract
- dashboard 호환 stream list/playback/status contract
- media plane 상태 조회

## 원칙

- media packet을 직접 처리하지 않는다.
- WebRTC/WHEP/HLS는 MediaMTX와 coturn이 담당한다.
- 이 서비스는 control plane으로 stream/ICE 상태를 API 형태로 제공한다.

## Dashboard cutover endpoints

```text
GET /api/v1/streams
GET /api/v1/streams/ice-servers
GET /api/v1/streams/{streamId}
GET /api/v1/streams/{streamId}/playback
GET /api/v1/streams/{streamId}/status
```

Nginx edge에서는 `/media-control/` prefix로 이 서비스를 노출한다. Dashboard는 `VITE_STREAM_API_BASE_URL=/media-control`일 때 Go media-control을 사용하고, 기본 `/api`일 때 기존 Python stream API를 사용한다.

## 테스트

```bash
go test ./...
go test ./... -cover
```
