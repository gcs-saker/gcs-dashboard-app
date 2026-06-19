# GCS-Saker Stack Synergy Audit

## 목적

기술 스택을 많이 도입하는 것 자체는 장점이 아니다.
각 스택의 강점을 실제 시스템 경계에 맞게 사용하고, 약점은 다른 스택이나 운영 규칙으로 보완해야 한다.
이 문서는 현재 코드 기준으로 다음을 점검한다.

- 어떤 스택이 실제 active runtime인지
- 각 스택의 장점이 어디에서 살아나는지
- 각 스택의 단점이 무엇이고 무엇으로 보완 중인지
- 아직 장점을 살리지 못한 profile, contract, prototype 스택은 무엇인지

## 전체 판정

현재 구조는 active core 기준으로는 방향이 좋다.
Nginx, Spring/Kotlin, Go media-control, MediaMTX, coturn, Redis, MySQL, React dashboard는 서로 역할이 비교적 명확하다.
특히 media frame을 application backend에 태우지 않고 MediaMTX/WebRTC로 분리한 점, 인증/정책을 Spring/Kotlin으로 분리한 점, stream control을 Go로 분리한 점은 각 스택의 강점을 살리는 방향이다.

다만 Saker v2 전체 관점에서는 아직 완성이라고 말하면 안 된다.
gRPC, DragonFly, PostGIS, MQTT hardened bridge, GraphQL, WebCodecs, AI sidecar, HTTP/3는 일부는 profile, 일부는 contract/prototype/deferred 상태다.
따라서 이 스택들은 "도입 완료"가 아니라 "장점 검증 대기"로 봐야 한다.

## Active Runtime Stack

| 스택 | 주요 장점 | 주요 단점 | 현재 장점을 살린 방식 | 단점 보완 방식 | 판정 |
| --- | --- | --- | --- | --- | --- |
| Nginx edge | 단일 public entrypoint, reverse proxy, buffering/upgrade 제어 | 설정이 복잡해지면 route drift 가능 | `/`, `/auth-policy/`, `/media-control/`, `/webrtc/`, `/hls/`, `/api/ops/events/stream`을 분기한다. WebRTC와 SSE에는 buffering off와 upgrade header를 둔다. | route contract test와 single-node config로 포트 직접 공개를 줄인다. | 장점 활용 좋음 |
| React/Vite dashboard | 빠른 UI 개발, component/hook 분리, lazy chunk | 상태가 흩어지면 불필요 렌더링과 optimistic 오해 가능 | lazy view, custom hook, memoized stream card, TanStack Query polling, IndexedDB local-first 설정을 사용한다. | optimistic update audit test, state contract 상수화, local-first와 server state 구분이 들어갔다. | 장점 활용 중 |
| TanStack Query | 서버 상태 cache, refetch, placeholder data, stale/gc 제어 | mutation cache를 잘못 쓰면 optimistic 오판 가능 | 운영 이벤트와 지표 조회처럼 반복 조회 server state에 사용한다. | mutation 패턴은 현재 막혀 있고, optimistic update static audit가 있다. | 제한적으로 잘 사용 |
| Spring/Kotlin auth-policy | 타입 안정성, domain/application/infrastructure 분리, security/session 정책에 강함 | JVM footprint와 boot time이 Go보다 크다 | 인증/인가, refresh session, 그룹 정책, 운영 이벤트, telemetry read model, GraphQL contract를 담당한다. | Media path는 맡기지 않고 Go/MediaMTX로 분리한다. Redis로 principal/session cache를 둔다. | 역할 적합 |
| Go media-control | 낮은 메모리, 빠른 startup, 동시성, 작은 HTTP control plane에 강함 | 복잡한 business rule은 Kotlin보다 표현력이 떨어질 수 있음 | stream list, playback URL, ICE server list, MediaMTX 연동, auth-policy authorization cache를 담당한다. | 인증/정책 판단은 Spring에 위임하고, Go는 thin control plane과 cache에 집중한다. | 역할 적합 |
| MediaMTX | WebRTC/HLS/RTSP 등 media plane 처리에 특화 | 인증/권한/업무 정책은 별도 서비스가 필요 | WHIP/WHEP/HLS media plane을 담당해 backend가 frame을 직접 처리하지 않는다. | Nginx route와 media-control policy layer가 앞에서 보완한다. | 핵심 장점 활용 |
| coturn primary/secondary | NAT traversal fallback, 폐쇄망 자체 STUN/TURN 가능 | relay 사용량이 늘면 대역폭/포트/CPU 부담 | STUN 우선, TURN fallback, primary/secondary 분리, relay port range 제한을 둔다. | ICE server cache, relay ratio 관측, candidate 수 제한, 외부 NAT smoke가 필요하다. | 필요하지만 계속 관측 필요 |
| Redis | 저지연 session/cache, TTL 기반 운영 상태 보관 | 휘발성/메모리 고갈/일관성 이슈 | refresh session, principal cache, stream list cache, ICE server cache, operational cache에 사용한다. | TTL, password, fallback behavior, MySQL durable store와 역할 분리로 보완한다. | 장점 활용 중 |
| MySQL legacy | 안정적인 정형 DB, 운영 친숙도, auth/user 저장에 적합 | geo/spatial과 대량 telemetry 분석에는 한계 | auth/user/ops 정형 데이터 기본 저장소로 유지한다. | geo bounded context는 PostGIS profile로 분리 후보를 둔다. | legacy default로 적합 |
| Python backend legacy/fallback | 빠른 실험, 기존 API와 AI sidecar 후보에 유리 | 고성능 auth/media core에는 타입/동시성 한계 | health, legacy/future fallback, AI/mock, telemetry buffer contract에 남아 있다. | active core는 Spring/Go로 내리고 Python은 fallback/prototype으로 축소한다. | 축소 방향 적절 |
| Docker Compose | 단일 노드 재현성, profile/override 실험 용이 | 운영 규모 확장, secret 관리, orchestration 한계 | active single-node와 geo/dragonfly/mqtt override를 분리한다. | 운영 배포 전 secret, health, rollback, server smoke gate가 필요하다. | 개발/검증에 적합 |

## Profile, Contract, Prototype Stack

| 스택 | 기대 장점 | 현재 상태 | 아직 장점을 못 살린 이유 | 다음 검증 |
| --- | --- | --- | --- | --- |
| MQTT broker | 장비 telemetry/control 흡수, intermittent device 연결에 강함 | profile | hardened override와 protobuf runtime smoke가 아직 release gate를 통과하지 않았다. | publish/deny smoke, auth topic ACL, telemetry bridge runtime |
| Protobuf | DTO drift 감소, binary contract, service/device 간 명확한 schema | contract | proto와 일부 mapper는 있으나 모든 runtime payload가 protobuf로 흐르지는 않는다. | Kotlin/Go/Python generated DTO 또는 명시 mapper 고정 |
| gRPC bidirectional streaming | service-to-service/device gateway 양방향 스트리밍에 적합 | contract | browser 경로가 아니며, actual server/client/compose wiring이 없다. | internal network smoke와 backpressure/error contract |
| DragonFly | Redis 호환 고성능 cache 후보 | profile | override는 있지만 Redis 대체 운영 지표 비교가 없다. | Redis/DragonFly 동일 smoke, latency/memory/license 기록 |
| PostgreSQL/PostGIS | 공간 쿼리, viewport, geo index에 적합 | profile | 기본 runtime DB가 아니고 geo smoke/upsert/explain이 남았다. | latest/history upsert, spatial viewport explain |
| GraphQL | 복합 dashboard read model에서 over-fetch/under-fetch 완화 | contract | dashboard client와 edge route가 아직 없다. media path에 쓰면 안 된다. | 큰 read model 전용 BFF 여부 결정 |
| WebCodecs + Canvas | HLS fallback frame processing, recording, AI overlay에 유리 | prototype | detection/plan 수준이고 worker pipeline이 없다. | worker init, fallback, frame metadata sync |
| HTTP/3 | edge latency와 mobile network에 잠재 이점 | deferred | 인증서, 폐쇄망 CA, Nginx 대체/확장 전략 미정 | 별도 edge profile benchmark |
| AI sidecar | overlay metadata와 음성/영상 AI 후처리 분리 | contract | runtime sidecar와 latency budget이 없다. | media path 직접 중계 금지, overlay metadata smoke |

## 서로의 단점 보완 구조

### Media path와 control path 분리

- MediaMTX는 media frame을 처리한다.
- Spring/Kotlin과 Go는 frame을 직접 들고 가지 않는다.
- MQTT, Protobuf, gRPC, GraphQL도 video/audio frame transport가 아니라 telemetry/control/read-model 후보로 제한한다.
- 이 구조 덕분에 backend DB나 auth 서버가 느려져도 media plane 전체가 같이 무거워지는 위험을 줄인다.

### 인증/정책과 stream control 분리

- Spring/Kotlin은 인증, refresh token, 그룹 정책처럼 business rule이 많은 영역을 맡는다.
- Go media-control은 stream 목록, playback URL, ICE server list처럼 작고 빠른 control API를 맡는다.
- Go가 Spring auth-policy에 authorization을 물어보고 짧은 TTL cache를 둔다.
- 이 구조는 중복 구현을 줄이면서 media-control의 지연을 낮추는 방향이다.

### Redis와 MySQL 역할 분리

- Redis는 TTL이 있는 session/cache/presence/ICE server cache에 적합하다.
- MySQL은 durable auth/user/ops 정형 데이터에 적합하다.
- refresh session과 principal cache는 Redis에서 빠르게 처리하되, 영속 데이터까지 Redis에 몰아넣지 않는다.
- 이 구조는 속도와 안정성을 분리하는 방식이다.

### Nginx edge와 internal networks

- 외부는 edge 하나로 들어오고 내부 control-net/media-net으로 나뉜다.
- dashboard, auth-policy, media-control, MediaMTX, backend의 직접 public exposure를 줄인다.
- WebRTC/HLS/SSE처럼 proxy 성격이 다른 경로에 개별 timeout/buffering 정책을 둔다.
- 단점은 Nginx route drift이므로 route contract test가 계속 필요하다.

### Local-first UI와 server state 분리

- IndexedDB/sessionStorage는 개인 레이아웃, CCTV 보기, stream alias처럼 UX 설정에만 사용한다.
- 서버 상태, 인증 상태, stream online 상태는 서버/registry/playback 관측을 기준으로 한다.
- 직접 주소 연결도 검증 전 `degraded`로 낮춰 optimistic success처럼 보이지 않게 했다.

## 현재 가장 잘 살린 장점

1. WebRTC/MediaMTX를 media plane에 두어 저지연 stream path를 backend API path와 분리했다.
2. Nginx 단일 entrypoint로 보안 경계를 단순화했다.
3. Spring/Kotlin은 인증/정책처럼 타입과 계층 분리가 중요한 영역에 배치했다.
4. Go는 stream control과 ICE list처럼 빠르고 작은 API에 배치했다.
5. Redis는 TTL cache/session/presence처럼 휘발성 저지연 데이터에 배치했다.
6. React/TanStack Query는 반복 조회 server state와 local-first preference를 구분해서 사용하기 시작했다.

## 아직 부족한 부분

1. gRPC는 장점을 살렸다고 말할 수 없다. proto와 abstraction은 있지만 runtime bidirectional path가 없다.
2. DragonFly는 Redis 대체 가능성을 검토한 수준이다. 성능이 좋아졌다고 말하려면 같은 workload smoke와 benchmark가 필요하다.
3. PostGIS는 geo profile이 있을 뿐 지도/telemetry read path의 기본 DB는 아니다.
4. MQTT는 장비 telemetry 흡수에 적합하지만 hardened runtime smoke가 아직 부족하다.
5. GraphQL은 dashboard read model 후보일 뿐, 현재 UI 통신의 핵심은 REST/JSON이다.
6. WebCodecs는 recording/AI overlay/HLS fallback 후보지만 실제 worker pipeline은 없다.
7. TURN 부담 완화는 방향은 맞지만 relay ratio, candidate type, first frame latency 지표를 release gate로 강제해야 한다.
8. Python legacy fallback이 오래 남으면 active core와 혼동될 수 있다. legacy/deprecated 경계가 계속 필요하다.

## 결론

현재 active core는 "각 스택의 장점을 비교적 잘 살리는 방향"으로 설계되어 있다.
하지만 v2급 전환에서 언급한 모든 스택이 완성된 것은 아니다.
따라서 앞으로의 보고와 PR에서는 다음 문장을 기준으로 삼는다.

- active runtime: 실제 compose, edge route, runtime smoke가 있는 스택
- profile: 선택 profile/override로 실행 가능한 스택
- contract: schema/interface/test는 있지만 runtime path가 없는 스택
- prototype: feature detection 또는 계획 단계
- deferred: 후보지만 현재 release 범위 밖

이 기준을 지키면 "좋은 기술을 많이 넣었다"가 아니라 "필요한 곳에서 장점이 증명된 기술만 active로 승격했다"는 구조가 된다.
