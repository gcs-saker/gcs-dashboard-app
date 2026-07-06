# GCS-Saker M7 media-control cutover

## 목적

기존 Python backend가 제공하던 stream list, playback URL, ICE server API를 즉시 제거하지 않고 Go `media-control`이 같은 dashboard contract를 제공하도록 병렬 전환 경로를 만든다.

## 전환 경로

- 기존 Python stream API: `/api/v1/streams`
- Go media-control 전환 API: `/media-control/api/v1/streams`
- Dashboard build-time 전환 값: `VITE_STREAM_API_BASE_URL=/media-control`

M7 single-node PoC는 stream API를 Go `media-control`로 바라보도록 기본값을 둔다. 기존 local compose와 운영 v0.2.0 계열은 기본값 `/api`를 유지해 Python backend 회귀를 계속 확인한다.

## Go media-control contract

- `GET /api/v1/streams`
- `GET /api/v1/streams/ice-servers`
- `GET /api/v1/streams/{streamId}`
- `GET /api/v1/streams/{streamId}/playback`
- `GET /api/v1/streams/{streamId}/status`

응답 필드는 dashboard가 이미 사용하는 DTO 형태를 따른다.

- `streamId`
- `path`
- `prefix`
- `assetId`
- `sensorId`
- `processorId`
- `date`
- `status`
- `displayName`
- `playbackUrls.webrtc`
- `playbackUrls.hls`

## 런타임 검증

```bash
scripts/smoke/m7_media_control_cutover_smoke.sh --check
scripts/smoke/m7_media_control_cutover_smoke.sh --run
```

`--run`은 sample stream을 RTSP로 MediaMTX에 publish한 뒤 edge의 `/media-control` 경유로 stream list, detail, playback, status, ICE server 계약을 확인한다.

## 남은 제한

- Go service는 media packet을 직접 처리하지 않는다. 실제 media plane은 계속 MediaMTX/coturn이 담당한다.
- 인증/인가 enforcement는 다음 단계에서 Spring/Kotlin auth-policy decision과 연결한다.
- Python stream API는 v0.2.0 회귀 및 fallback 용도로 유지한다.
