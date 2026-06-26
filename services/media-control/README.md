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

Nginx edge에서는 `/media-control/` prefix로 이 서비스를 노출한다. Dashboard는 `VITE_STREAM_API_BASE_URL=/media-control`을 기본값으로 사용하며 stream registry, ICE server, playback, publish authorization 요청을 Go media-control로 보낸다.

## Legacy compatibility endpoint

```text
GET /stream/status
```

M7 runtime smoke와 예전 운영 체크 호환을 위해 `/stream/status`는 `{"stream":"ready"}`를 계속 반환한다. 다만 이 경로는 legacy compatibility endpoint이므로 `Deprecation: true`와 `X-GCS-Replacement-Route: /media-control/api/v1/streams` header를 함께 내려준다. 신규 운영 체크와 dashboard stream 조회는 `/media-control/api/v1/streams*`를 사용한다.

## Runtime metrics

```text
GET /metrics/runtime
GET /metrics
```

Go 런타임 튜닝(`GOGC`, `GOMEMLIMIT`)이 실제 운영에서 어떤 영향을 주는지 보기 위해 goroutine, heap, GC pause, memory limit 지표를 JSON으로 제공한다. 이 endpoint는 운영망에서는 Nginx 또는 방화벽으로 내부 관리자 접근만 허용한다.

`/metrics`는 Prometheus text format endpoint다. 이 endpoint는 컨테이너 내부 scrape 전용이며 public Nginx entrypoint에서는 `/media-control/metrics`를 404로 차단한다. metric label에는 stream id, device id, token 같은 cardinality/secret 위험 값을 넣지 않는다.

Metric naming rule:

- `gcs_media_control_http_requests_total`: stable route/method/status 기준 HTTP request count
- `gcs_media_control_http_request_duration_seconds`: stable route/method/status 기준 HTTP latency histogram
- `gcs_media_control_stream_registry_requests_total`: MediaMTX stream registry 조회 result count
- `gcs_media_control_stream_registry_duration_seconds`: MediaMTX stream registry 조회 latency histogram
- `gcs_media_control_ice_server_requests_total`: ICE server list response result count
- `gcs_media_control_ice_servers_returned`: request당 반환된 healthy ICE server 수
- `gcs_media_control_stream_cache_events_total`: stream list cache hit/miss/degraded count
- `gcs_media_control_ice_cache_events_total`: ICE server cache hit/miss/degraded count
- `gcs_media_control_errors_total`: source/reason 기준 low-cardinality error count

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

## Concurrency gate

```bash
go test -race ./...
../../scripts/m10_media_control_concurrency_gate.sh
```

`streamcache.CachedStreamLister`와 `turn.CachedIceServerProvider`는 cache miss 순간에 여러 HTTP 요청이 동시에 들어와도 upstream(MediaMTX/ICE registry)을 한 번만 조회하도록 mutex로 refresh 구간을 보호한다. 이 잠금은 media frame 경로가 아니라 control-plane cache refresh에만 걸리므로 WebRTC media latency에 직접 개입하지 않는다.

M10 concurrency gate는 다음을 고정한다.

- `go.uber.org/goleak`: stream cache와 ICE cache package의 goroutine leak을 테스트 종료 시점에 검출한다.
- `go test -race ./...`: stream registry/cache update, ICE server cache refresh, HTTP handler 테스트를 race detector로 실행한다.
- defensive copy test: caller가 반환 slice를 수정해도 cached stream/ICE 상태가 오염되지 않는지 확인한다.

일반 unit test보다 `-race`는 느리므로 로컬 빠른 피드백은 `go test ./...`를 사용하고, PR/배포 전에는 `../../scripts/m10_media_control_concurrency_gate.sh`를 실행한다.
