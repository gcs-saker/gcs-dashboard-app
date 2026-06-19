# GCS-Saker 기술 스택 장단점 및 활용 보고서

작성일: 2026-06-19

## 1. 보고 목적

이번 보고서는 "좋아 보이는 기술을 많이 넣었다"가 아니라, 우리가 선택한 언어, 프레임워크, 라이브러리의 장점과 단점을 정리하고, 실제 GCS-Saker 코드에서 그 장점을 어떻게 살리고 있는지 확인하기 위한 문서다.

특히 단순히 `fetch`를 `TanStack Query`로 바꿨다는 식의 표면적 변경은 의미가 없다.
중요한 것은 각 기술이 맡아야 할 책임을 정확히 맡고 있는지, 그리고 다른 기술의 약점을 구조적으로 보완하는지다.

## 2. 전체 결론

현재 active core 기준에서는 기술 선택의 방향이 대체로 맞다.

- React/TypeScript는 복잡한 대시보드 UI를 component, hook, typed contract 중심으로 나누는 데 쓰이고 있다.
- TanStack Query는 모든 API 호출을 대체하는 용도가 아니라, 반복 조회가 필요한 server state에 제한적으로 쓰이고 있다.
- Spring/Kotlin은 인증, 인가, refresh session, 그룹 정책, 운영 이벤트처럼 타입 안정성과 계층 분리가 중요한 영역을 맡고 있다.
- Go media-control은 stream list, ICE server list, playback URL처럼 작고 빠른 control API를 맡고 있다.
- MediaMTX는 실제 media frame을 담당하고, backend는 media frame을 직접 들고 가지 않는다.
- Redis는 영속 DB 대체가 아니라 session/cache/presence/ICE list 같은 TTL 기반 저지연 데이터에 쓰이고 있다.

다만 gRPC, DragonFly, PostGIS, MQTT hardened bridge, GraphQL, WebCodecs, AI sidecar, HTTP/3는 아직 완성된 active stack이 아니다.
이들은 후보 또는 계약 단계이므로 "도입 완료"라고 표현하면 안 된다.

## 3. Frontend 언어, 프레임워크, 라이브러리

| 기술 | 장점 | 단점 | 우리 코드에서 장점을 살린 방식 | 보완 필요 |
| --- | --- | --- | --- | --- |
| TypeScript | 타입 계약, 컴파일 단계 오류 발견, DTO/상태 contract 관리에 강함 | 타입이 느슨해지거나 `any`가 늘면 효과가 급감 | API route, query key, stream status, geometry status를 상수와 type으로 고정하고 `npm run typecheck`를 빌드 전에 수행한다. | stream/player snapshot, map marker, user preference DTO를 더 좁은 type/value object로 분리하면 더 좋다. |
| React 19 | component 조합, hook 기반 상태 분리, UI 업데이트 모델이 좋음 | state가 흩어지면 렌더링 폭발과 effect 오남용이 생김 | Dashboard view, stream card, player, event log, map, settings를 component와 custom hook으로 분리했다. StreamCard memoization과 lazy view preload도 있다. | DashboardMvp가 여전히 크다. view model hook과 layout controller로 더 나누는 것이 좋다. |
| Vite | 빠른 개발 서버, 빠른 build, modern bundle 구성 | chunk 관리와 fallback 전략을 따로 잡아야 함 | dashboard build와 typecheck를 `npm run build`에 묶었다. lazy import로 이벤트 로그, 지도, 설정 화면을 지연 로드한다. | 큰 chunk 경고 기준을 운영 bundle budget으로 문서화해야 한다. |
| TanStack Query | server state cache, stale/gc, refetch interval, placeholder data에 강함 | mutation을 잘못 쓰면 optimistic update 오판 가능 | 운영 이벤트와 metrics처럼 반복 조회되는 server state에 사용한다. 모든 local state를 무리하게 query cache에 넣지 않았다. | 현재는 query 사용 범위가 제한적이다. 서버 상태와 UI local state의 경계 문서가 더 필요하다. |
| Zustand | 전역 UI 상태를 작고 단순하게 관리하기 좋음 | server state까지 넣으면 cache와 정합성 문제가 생김 | 이벤트 로그 filter, selected event처럼 UI 전역 상태에 사용한다. 서버 이벤트 자체는 hook/query 흐름에서 받는다. | dashboard layout/user preference와의 역할 경계를 더 명확히 둘 필요가 있다. |
| IndexedDB/sessionStorage | 개인 설정을 브라우저에 유지 가능, 서버 부하 없음 | 저장 실패가 조용히 지나가면 UX 혼란 가능, 보안 민감 데이터 저장 금지 | 대시보드 view, CCTV 품질, layout, stream alias 같은 local-first preference에만 사용한다. 토큰이나 서버 상태는 넣지 않는다. | IndexedDB 저장 실패 toast/telemetry가 있으면 더 좋다. |
| React Router | 인증 redirect와 route guard 구현에 적합 | route가 권한 정책과 분리되면 우회 UX가 생김 | login redirect, RequireAuth, session 만료 시 login 이동에 사용한다. | route별 권한 matrix를 더 명확히 문서화하면 좋다. |
| Leaflet / React-Leaflet | 빠른 지도 UI, marker/popup/event handling에 강함 | 대량 marker/고성능 vector에는 한계 | stream GPS를 지도 marker와 popup에 연결하고 selected stream focus를 구현했다. | 폐쇄망 tile, 대량 marker clustering, marker interaction 최적화가 남아 있다. |
| MapLibre GL | vector tile, 오프라인/자체 tile 전략에 유리 | 설정과 tile pipeline 구축 부담 | 공개 API 의존도를 낮추는 지도 엔진 후보로 들어와 있다. | 현재 dashboard 주 지도 경로와 완전 통합되지는 않았다. |
| HLS.js | WebRTC 실패 시 fallback playback에 적합 | WebRTC보다 지연이 크다 | HLS fallback player와 smoke test 경로를 둔다. 기본은 WebRTC, HLS는 fallback으로 제한한다. | fallback 진입 기준, 지연 표시, 녹화/돌려보기와 연결이 필요하다. |
| Recharts | 운영 지표 그래프를 빠르게 구성 가능 | 고빈도 실시간 그래프에는 최적화가 필요 | 서버 상태, 이벤트 로그, RTT/운영 지표 표현 후보로 사용한다. | 고빈도 업데이트는 downsampling, RAF, memoization이 필요하다. |
| Sass | 복잡한 dashboard layout 스타일을 구조화하기 쉬움 | 파일이 커지면 selector 복잡도가 증가 | DashboardMvp 스타일을 SCSS로 관리하고 panel/view별 class 구조를 둔다. | feature별 SCSS 분리와 design token 정리가 더 필요하다. |
| Vitest / Testing Library | UI 기능과 hook 동작을 빠르게 검증 | 실제 브라우저/네트워크 품질은 완전 대체 불가 | stream player, failure smoke, event log, layout, auth page 단위 테스트에 사용한다. | Playwright류 runtime browser smoke와 결합하면 더 좋다. |

### Frontend 활용 평가

잘한 점은 server state, local UI state, local-first preference를 구분하기 시작했다는 것이다.
예를 들어 이벤트 로그는 TanStack Query와 SSE/polling으로 서버 상태를 받지만, filter와 selected event는 Zustand가 맡는다.
대시보드 레이아웃과 stream alias는 IndexedDB/sessionStorage의 local-first 설정으로 분류한다.
이 구조는 모든 상태를 하나의 store에 넣는 것보다 책임이 선명하다.

아쉬운 점은 DashboardMvp가 아직 너무 많은 orchestration을 갖고 있다는 것이다.
React의 장점은 component와 hook 분리에서 나오는데, 대시보드 최상위 컴포넌트가 계속 커지면 그 장점이 줄어든다.

## 4. Backend 언어, 프레임워크, 라이브러리

| 기술 | 장점 | 단점 | 우리 코드에서 장점을 살린 방식 | 보완 필요 |
| --- | --- | --- | --- | --- |
| Kotlin | null safety, data class, sealed/domain modeling, Java ecosystem 활용 | 러닝커브와 build 시간이 Python/Go보다 큼 | auth-policy에서 DTO/domain/API contract를 type으로 분리하고 compiler strict option을 사용한다. | value class/type alias 확대, domain factory 정리가 더 가능하다. |
| Spring Boot | 인증/인가, validation, dependency injection, 계층형 API 구성에 강함 | media/control path까지 맡기면 무거워질 수 있음 | 인증, refresh session, 그룹 정책, 운영 이벤트, telemetry read model을 담당한다. media frame은 맡지 않는다. | security policy와 group policy integration test를 더 늘려야 한다. |
| Spring JDBC | 명시 SQL, query tuning, 예측 가능한 DB 접근 | boilerplate가 JPA보다 많음 | 운영 이벤트/read model 등에서 명시 repository와 schema support를 둔다. | 실행 계획 기반 index 검증과 slow query 기준을 추가해야 한다. |
| Spring Data JPA | entity lifecycle, ORM, lazy fetch, repository 생산성 | N+1, 불필요한 join, fetch 전략 오남용 위험 | operational event entity/repository 후보가 있다. | 현재 핵심 저장 경로는 JDBC 성격이 강하다. JPA를 쓸 곳과 쓰지 않을 곳을 더 명확히 해야 한다. |
| Spring Data Redis | session/cache/presence 저장에 적합, TTL 처리 용이 | cache invalidation과 장애 fallback 설계 필요 | refresh session store, principal cache, operational read cache에 사용한다. | Redis 장애 시 degraded behavior smoke를 강화해야 한다. |
| GraphQL Spring | 복합 read model에서 필요한 필드만 조회 가능 | media path에 쓰면 오히려 복잡하고 느려질 수 있음 | operational read model 후보와 test contract가 있다. | dashboard client와 edge route가 아직 active가 아니므로 "후보"로만 봐야 한다. |
| java-jwt | JWT 생성/검증이 명확하고 Java/Kotlin과 잘 맞음 | secret/rotation/expiry 정책을 엄격히 관리해야 함 | access token, refresh token, bearer principal resolution에 사용한다. | key rotation, token family reuse detection 강화가 필요하다. |
| Jackson Kotlin Module | Kotlin data class JSON 직렬화에 적합 | DTO field 계약이 흔들리면 런타임 호환 문제 | API DTO 분리와 contract test에 사용한다. | DTO field contract를 endpoint별로 더 넓혀야 한다. |
| JUnit / Spring Test / H2 / JaCoCo | controller/service/repository 테스트와 coverage 확인에 적합 | 실제 MySQL/Redis/MediaMTX와 완전히 같지는 않음 | auth-policy test와 coverage verification을 Gradle check에 묶었다. | Testcontainers 또는 compose 기반 integration smoke가 필요하다. |

### Backend 활용 평가

Kotlin/Spring은 "업무 정책이 복잡하고 틀리면 안 되는 영역"에 쓰는 것이 가장 좋다.
현재 인증/인가, refresh session, 그룹 정책, 운영 이벤트처럼 정책적 의미가 큰 영역에 배치되어 있어 방향이 맞다.
반대로 media frame이나 초저지연 signaling 자체를 Spring에 몰아넣지 않은 것도 좋은 선택이다.

보완점은 DB 계층이다.
JDBC와 JPA가 같이 있는 만큼, 어떤 read/write path에서 JPA를 쓰고 어떤 곳에서 명시 SQL을 쓰는지 기준이 더 선명해야 한다.
대량 telemetry, 이벤트 로그, geo query는 ORM만으로 해결하기보다 query plan과 index 설계가 같이 따라가야 한다.

## 5. Go Media-Control

| 기술 | 장점 | 단점 | 우리 코드에서 장점을 살린 방식 | 보완 필요 |
| --- | --- | --- | --- | --- |
| Go | 빠른 startup, 낮은 메모리, goroutine/concurrency, 작은 binary | 복잡한 domain modeling은 Kotlin보다 단순한 표현이 필요 | media-control에서 stream list, ICE server list, playback URL, auth-policy cache를 담당한다. | runtime benchmark와 race test를 더 명확히 해야 한다. |
| net/http 기반 API | dependency 적고 예측 가능 | framework 편의 기능은 적음 | HTTP server를 얇게 두고 domain, mediamtx client, streamcache, turn registry로 분리했다. | middleware, error response contract를 더 중앙화할 수 있다. |
| sync.Mutex cache guard | cache stampede 방지에 단순하고 효과적 | lock 범위가 커지면 병목 가능 | stream list cache, ICE server list cache에서 refresh lock을 둔다. | high concurrency benchmark로 lock 영향 확인 필요. |
| Redis string cache | language-neutral cache, TTL 적용 쉬움 | JSON marshal/unmarshal 비용과 cache miss path 고려 필요 | stream list, ICE server list를 Redis에 캐시한다. | cache key versioning과 장애 fallback 지표가 필요하다. |

### Go 활용 평가

Go는 지금 역할이 꽤 잘 맞다.
stream list와 ICE server list는 요청 빈도가 높고 응답이 작으며, 캐시와 짧은 authorization TTL이 효과적인 영역이다.
Spring이 정책을 판단하고 Go가 빠른 control plane을 제공하는 구조는 각 언어의 장점을 살린다.

다만 Go media-control이 더 커져서 정책 판단까지 흡수하면 장점이 줄어든다.
Go는 media-control과 edge-adjacent API에 집중하고, 복잡한 조직/권한 정책은 Spring에 남기는 것이 좋다.

## 6. Python Legacy / Fallback

| 기술 | 장점 | 단점 | 우리 코드에서 장점을 살린 방식 | 보완 필요 |
| --- | --- | --- | --- | --- |
| Python 3.12 | 빠른 실험, AI/데이터 처리 라이브러리 접근성 | 정적 타입/성능/동시성은 Kotlin/Go보다 약함 | legacy backend, AI mock/contract, telemetry buffer, smoke script에 남겨두었다. | active core와 legacy fallback 경계를 계속 줄여야 한다. |
| FastAPI | 빠른 API 작성, Pydantic DTO, docs 친화적 | 핵심 인증/운영 정책이 커지면 관리 부담 | AI sidecar, mock endpoint, fallback API 후보에 적합하다. | auth core나 media control core로 다시 커지지 않게 해야 한다. |
| Pydantic | runtime validation과 schema 정의에 강함 | 대량 처리에서는 validation 비용 고려 필요 | schemas.py와 contract test에서 DTO 검증에 사용한다. | protobuf/generated DTO와 경계가 생기면 mapper 기준 필요. |
| SQLAlchemy / PyMySQL | DB 추상화와 MySQL 연결에 익숙함 | async/transaction/query tuning 기준이 없으면 성능 저하 | legacy persistence와 test contract에 남아 있다. | active DB path가 Spring으로 이동하면 legacy 범위를 축소해야 한다. |
| paho-mqtt | MQTT publish/subscribe 실험이 쉽다 | 운영 보안/ACL/재연결 정책은 별도 설계 필요 | MQTT bridge와 control publisher 후보에 사용한다. | hardened broker와 protobuf payload smoke가 필요하다. |
| Pytest / mypy | 빠른 테스트와 정적 검사를 제공 | 타입이 충분히 선언되지 않으면 mypy 효과 제한 | pytest, coverage, mypy 설정으로 legacy와 script 검증에 사용한다. | Python active code를 줄이되 남는 코드는 typed DTO로 더 묶어야 한다. |

### Python 활용 평가

Python은 active core가 아니라 실험, fallback, AI sidecar 후보, smoke tooling에 두는 것이 맞다.
우리가 Python을 계속 핵심 인증/stream control에 쓰면 성능과 타입 안정성 문제가 커질 수 있다.
현재 Spring/Go로 core를 나누고 Python을 주변부로 낮추는 방향은 적절하다.

## 7. Media / Networking / Infra Stack

| 기술 | 장점 | 단점 | 우리 코드에서 장점을 살린 방식 | 보완 필요 |
| --- | --- | --- | --- | --- |
| MediaMTX | WebRTC, HLS, RTSP, WHIP/WHEP media plane에 특화 | 업무 인증/권한 정책은 별도 필요 | 실제 media frame은 MediaMTX가 처리한다. backend API는 frame을 중계하지 않는다. | first frame latency, reconnect, audio stats smoke 자동화 필요. |
| WebRTC | 초저지연 양방향 media에 적합 | NAT/ICE/TURN/브라우저 호환성이 어렵다 | 기본 수신 경로로 사용하고, STUN 우선/TURN fallback 구조를 둔다. | candidate type, relay ratio, WHEP response, first frame 지표를 release gate로 고정해야 한다. |
| HLS | 호환성과 fallback에 좋음 | 지연이 크다 | WebRTC 실패 시 fallback으로 사용한다. | fallback UX와 지연 경고가 더 필요하다. |
| coturn | 자체 STUN/TURN, 폐쇄망 NAT 대응 가능 | relay 트래픽이 몰리면 대역폭과 포트 부담 | primary/secondary, relay port range, ICE server list cache를 둔다. | TURN allocation failure와 relay ratio 관측이 필요하다. |
| Nginx | 단일 entrypoint, reverse proxy, route 분리, buffering 제어 | 설정 drift와 TLS/HTTP3 전략 복잡성 | `/auth-policy`, `/media-control`, `/webrtc`, `/hls`, `/api/ops/events/stream`을 나눠 보낸다. | route contract와 HTTPS/인증서 운영 전략이 계속 필요하다. |
| Docker Compose | 로컬/서버 재현성, profile/override 실험 | 대규모 orchestration과 secret 관리에는 한계 | single-node active compose와 geo/dragonfly/mqtt override를 분리했다. | 운영 배포는 secret, backup, rollback, health gate가 더 필요하다. |

## 8. DB / Cache / Messaging 후보

| 기술 | 장점 | 단점 | 현재 상태 | 판단 |
| --- | --- | --- | --- | --- |
| MySQL | 정형 데이터, 운영 친숙도, auth/user 저장에 적합 | geo/spatial, 대량 telemetry 분석은 한계 | active legacy/default DB | auth/user/ops 정형 데이터는 유지 가능 |
| Redis | 매우 빠른 TTL cache/session/presence | 영속 원장으로 쓰면 위험 | active cache/session | refresh session, principal cache, ICE/stream cache에 적합 |
| DragonFly | Redis 호환 고성능 대체 후보 | license/image/운영 호환성 검증 필요 | profile | 아직 성능 향상 완료라고 말하면 안 됨 |
| PostgreSQL/PostGIS | geo index, viewport query, 위치 기반 데이터에 강함 | migration 비용, 운영 경험 필요 | geo profile | GPS/지도/geometry가 커질 때 강점이 큼 |
| MQTT | 장비 telemetry/control 흡수에 적합 | 보안/ACL/재전송/스키마 관리 필요 | hardened profile/bridge 후보 | media frame이 아니라 telemetry/control에만 적합 |
| Protobuf | binary contract, schema drift 방지 | browser JSON UI와 병행 시 mapper 부담 | contract | device/internal/native gateway에 적합 |
| gRPC bidi | internal service/device gateway 양방향 streaming에 적합 | browser 직접 통신에는 부적합 | contract | service-to-service에만 제한해야 함 |
| GraphQL | 복합 read model에서 필요한 필드만 조회 | media/control path에 쓰면 과함 | contract | dashboard read-model BFF 후보 |

## 9. 서로의 단점을 커버하는 방식

### WebRTC의 NAT 복잡성

WebRTC는 초저지연 장점이 크지만 ICE/STUN/TURN이 어렵다.
이를 coturn primary/secondary, ICE server cache, HLS fallback, MediaMTX WHEP/WHIP로 보완한다.

### Spring의 무거움

Spring/Kotlin은 정책과 인증에는 강하지만 media path까지 맡기면 무거워진다.
Go media-control과 MediaMTX를 별도 layer로 두어 stream control과 media frame 처리를 분리한다.

### Go의 정책 표현 한계

Go는 빠른 control plane에는 좋지만 복잡한 조직/권한 정책을 모두 넣기에는 유지보수성이 떨어질 수 있다.
그래서 Go는 Spring auth-policy에 authorization을 위임하고 짧은 TTL cache만 둔다.

### Redis의 휘발성

Redis는 빠르지만 영속 원장으로 쓰면 위험하다.
세션, principal cache, presence, ICE list처럼 TTL 데이터만 맡기고, auth/user/ops durable data는 MySQL에 둔다.

### Frontend local state 혼란

React local state, Zustand, TanStack Query, IndexedDB가 섞이면 혼란이 생길 수 있다.
현재 기준은 다음과 같다.

- TanStack Query: 서버에서 반복 조회하는 server state
- Zustand: 이벤트 로그 filter 같은 UI 전역 state
- IndexedDB/sessionStorage: 개인 UI 설정
- React local state: 컴포넌트 내부 interaction

이 구분은 좋은 방향이다.
다만 DashboardMvp가 커지고 있어 분리를 계속해야 한다.

## 10. 최종 평가

현재 우리가 가장 잘 살린 장점은 다음 네 가지다.

1. MediaMTX/WebRTC가 media plane을 맡고 backend가 frame을 들고 가지 않는다.
2. Spring/Kotlin이 인증/정책을 맡고 Go가 빠른 stream control을 맡는다.
3. Redis는 TTL cache/session/presence에만 쓰고 MySQL은 durable 정형 데이터에 남긴다.
4. Frontend는 server state, local UI state, local-first preference를 점점 분리하고 있다.

가장 조심해야 할 부분은 다음이다.

1. gRPC, DragonFly, PostGIS, GraphQL, WebCodecs를 active complete처럼 말하면 안 된다.
2. TanStack Query를 단순 fetch 대체제로 쓰면 의미가 없다. server state cache/refetch/placeholder가 필요한 곳에만 써야 한다.
3. Redis를 만능 성능 해결책처럼 쓰면 안 된다. 영속성, invalidation, 장애 fallback이 항상 따라야 한다.
4. MQTT/gRPC/GraphQL에는 media frame을 태우면 안 된다. telemetry/control/read-model에 제한해야 한다.
5. Python legacy가 오래 남으면 active core와 혼동된다. fallback/prototype 경계를 계속 유지해야 한다.

따라서 현재 구조는 "기술 선택의 방향은 좋지만, 후보 스택은 아직 후보로 남겨야 하는 상태"다.
다음 단계는 각 후보 스택을 실제 benchmark와 runtime smoke로 검증한 뒤, 통과한 것만 active로 승격하는 것이다.
