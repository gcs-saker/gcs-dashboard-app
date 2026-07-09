# GCS-Saker M10 Protocol Boundary and gRPC Cutover Guide

## 목적

이 문서는 PR #501 머지 전 기준으로 GCS-Saker의 통신 경계를 고정한다.
핵심은 모든 API를 gRPC로 바꾸는 것이 아니라, 각 통신 방식이 가장 잘하는 일을 맡도록 분리하는 것이다.

- Browser dashboard는 HTTPS/JSON, SSE, WHEP/HLS를 유지한다.
- Device gateway, native client, service-to-service control/data plane은 Protobuf/gRPC 또는 MQTT/Protobuf로 이동한다.
- WebRTC/HLS media frame은 MQTT, GraphQL, gRPC, REST payload에 태우지 않는다.
- Spring/Kotlin auth-policy는 policy decision point다.
- Go media-control은 media control-plane policy enforcement point다.
- MediaMTX와 coturn은 media/signaling/ICE plane을 담당한다.

## PR #501 머지 가능 상태

확인 시점: 2026-07-06

| 항목 | 상태 | 의미 |
| --- | --- | --- |
| PR | #501 gRPC device gateway readiness 승격 | 현재 gRPC device gateway 기반 작업 PR |
| Head branch | `feature/m10-grpc-device-gateway` | 최근 `v0.7.2` tag가 붙은 브랜치 |
| Base branch | `feature/m10-api-contract-docs` | main 직행 전 계약 문서/경계 정리 branch |
| Mergeable | `MERGEABLE` | GitHub 기준 충돌 없음 |
| Draft | `false` | 리뷰/머지 가능 상태 |
| Review decision | empty | 승인/변경요청 review가 아직 없음 |
| Status checks | empty | GitHub 필수 check rollup이 현재 붙어 있지 않음 |

머지 전 로컬 기준 검증은 다음 결과를 기준으로 삼는다.

| 검증 | 최근 결과 |
| --- | --- |
| Spring auth-policy | `./gradlew test` 성공 |
| Go media-control | `go test ./...` 성공 |
| Python fallback/backend | `412 passed, 1 warning` |
| React dashboard | `106 files / 433 tests passed` |
| Architecture intent gate | `checkedIntents=9`, `checkedAssertions=78` |
| M7 집중 gate | `15 passed` |
| npm audit | `0 vulnerabilities` |
| Dependabot open alerts | `0` |

## 최종 프로토콜 경계

| 영역 | 주체 | 프로토콜 | 대표 경로 | 현재 상태 | 목표 |
| --- | --- | --- | --- | --- | --- |
| Public edge | Browser, publisher, native client | HTTPS/WSS/WebRTC over 443 | `/`, `/auth-policy/*`, `/media-control/*`, `/webrtc/*`, `/hls/*` | Nginx 단일 인입 원칙 확정 | 외부 공개 포트는 443 중심 유지 |
| Dashboard UI | React/TypeScript | HTTPS/JSON, SSE | `/auth-policy/auth/*`, `/media-control/api/v1/streams*`, `/ops/*` | 유지 | Browser는 gRPC 직접 연결 금지 |
| Dashboard media receive | React player | WHEP WebRTC, HLS fallback | `/webrtc/{stream}/whep`, `/hls/{stream}` | 유지 | 초저지연은 WHEP 우선, HLS는 fallback |
| Browser publisher | Web/mobile browser | WHIP WebRTC, HTTPS/JSON token request | `/media-control/api/v1/streams/{id}/publish`, `/webrtc/{stream}/whip` | 일부 구현 | publish token 선발급 후 WHIP |
| Device gateway | 로봇/드론 gateway | gRPC bidi + Protobuf | `/gcs.saker.v1.SakerGatewayService/Exchange` | PR #501에서 readiness 승격 | telemetry, stream event, command ack 이동 |
| Device telemetry bulk | 로봇/드론 gateway | MQTT + Protobuf | `gcs/{org}/{group}/{asset}/telemetry` | 검증 profile 존재 | 대량 telemetry 흡수 전용 |
| Auth/session/group policy | Spring/Kotlin auth-policy | HTTPS/JSON, internal DTO | `/auth/*`, `/policy/streams/access` | 활성 core | PDP 역할 고정 |
| Media control | Go media-control | HTTPS/JSON, gRPC internal | `/api/v1/streams*`, `/v1/mediamtx/auth`, gRPC Exchange | 활성 core | PEP, stream registry, ICE, token 발급 |
| Media plane | MediaMTX | WHIP/WHEP/HLS/RTSP | `/webrtc/*`, `/hls/*`, RTSP internal | 활성 core | frame 중계 전담 |
| ICE plane | coturn pair | STUN/TURN UDP/TCP | `3478`, relay range | 활성 core | STUN 우선, TURN fallback |
| Operational read model | Spring/Kotlin | HTTPS/JSON, SSE | `/ops/server-health/snapshots`, `/ops/stream-sessions`, `/ops/stream-sessions/stream` | 활성화 중 | dashboard read model 유지 |
| Legacy fallback | Python/FastAPI | HTTPS/JSON, MQTT/Protobuf adapter | `/stream/*`, `/telemetry/*`, `/control/*`, `/api/v1/*` | fallback/compat | active core에서 점진 하향 |
| Cache/session | Redis or DragonFly profile | Redis protocol | refresh session, stream cache, ICE cache | Redis 기본, DragonFly 후보 | TTL cache와 session 분리 |
| Durable relational DB | PostgreSQL/PostGIS target | SQL/Spatial SQL | telemetry history, asset, group, geo | 후보/profile | MySQL legacy 제거 방향 |
| AI overlay sidecar | FastAPI or future Spring AI | HTTPS/JSON, metadata only | `/api/v1/ai/*` 후보 | 후보 | frame이 아니라 overlay metadata만 전달 |
| GraphQL BFF | Dashboard read-model 후보 | GraphQL over HTTPS | `/graphql` 후보 | 미도입 | media path 제외, 복합 read model 전용 |
| Event analytics | Kafka/Logstash/Batch 후보 | Event stream/batch | UX log, ops event, stream dropout | 설계 예정 | 운영/UX 분석 데이터 축적 |

## REST로 유지할 경계

아래 경로는 gRPC로 바꾸지 않는다.

| 기능 | 소유 서비스 | 유지 프로토콜 | 이유 |
| --- | --- | --- | --- |
| 로그인/회원가입/refresh/logout/me | Spring auth-policy | HTTPS/JSON + httpOnly cookie | Browser session과 CSRF/origin 정책에 적합 |
| Dashboard stream list/detail/playback/status | Go media-control | HTTPS/JSON | Browser와 TanStack Query에 적합 |
| ICE server list for browser | Go media-control | HTTPS/JSON | TURN credential 포함, auth-policy decision 뒤 반환 |
| Dashboard operational events/read model | Spring auth-policy | HTTPS/JSON, SSE | UI filtering, event log, server state에 적합 |
| Map/time/config read | Spring auth-policy or dashboard config API | HTTPS/JSON | 사용자 설정/환경값 read에 적합 |
| WHEP/WHIP/HLS | MediaMTX via Nginx | WebRTC/HLS protocol | media frame 경로는 전용 media protocol 유지 |
| Prometheus metrics | service-local scrape | Prometheus text | public edge 노출 금지, 내부 scrape 전용 |

## gRPC/Protobuf로 전환할 경계

아래 경로는 REST보다 gRPC/Protobuf 또는 MQTT/Protobuf가 적합하다.

| 전환 대상 | 현재 경로/구현 | 목표 경로 | 우선순위 | 완료 기준 |
| --- | --- | --- | --- | --- |
| Device gateway telemetry | Python `TelemetryEnvelopePayload`, MQTT bridge 일부 | gRPC Exchange 또는 MQTT Protobuf consumer | P0 | malformed payload, unauthorized metadata, duplicate idempotency test |
| Stream session event | Go/Python stream registry event | gRPC `GatewayStreamRequest.stream_event` | P0 | stream online/offline/reconnect event가 media-control registry에 반영 |
| Command ack | Python `StreamCommandPayload`, MQTT/control sender | gRPC `GatewayStreamRequest.command_ack` 또는 MQTT Protobuf | P0 | command id 기준 ack round-trip과 timeout test |
| Control command dispatch | Python `/control`, MQTT sender | Spring/Go policy 후 gRPC/MQTT Protobuf dispatch | P1 | auth-policy decision 후 group scoped command 전송 |
| Gateway backpressure/reconnect | 문서/테스트 일부 | gRPC response stream status | P1 | queue full, retry-after, reconnect resume smoke |
| Native/mobile operator client | 미구현 | gRPC or HTTPS/JSON hybrid | P2 | browser와 별도 client credential flow |
| AI overlay metadata internal path | mock REST | Protobuf metadata event 후보 | P2 | frame 없이 metadata만 dashboard overlay로 반영 |

## 전환하지 않을 것

| 대상 | 결정 | 이유 |
| --- | --- | --- |
| WebRTC media frame | gRPC/MQTT/GraphQL에 싣지 않음 | latency, jitter, bandwidth, backpressure 위험 |
| Browser direct gRPC | 도입하지 않음 | 브라우저 호환성, proxy, auth/cookie/CSRF 모델과 맞지 않음 |
| Dashboard read model 전체 GraphQL 전환 | 후순위 | 현재 JSON DTO가 충분하고 media path가 아님 |
| TURN relay payload 최적화를 앱 layer로 우회 | 하지 않음 | TURN 부담은 ICE 후보, UDP path, relay capacity로 해결 |

## 남은 작업 이슈 분해안

### P0. Protocol boundary gate

목표:

- 이 문서의 REST/gRPC/MQTT/WebRTC 경계가 코드와 맞는지 static gate로 검증한다.
- media frame이 MQTT/gRPC/GraphQL payload로 들어가지 않는다는 금지 규칙을 테스트한다.

검증:

- `services/media-control/README.md`의 gRPC device gateway 설명 확인
- `backend/modules/messaging/sender.py`의 gRPC/MQTT sender abstraction 확인
- `backend/mqtt/consumer_bridge.py`의 Protobuf telemetry bridge 확인
- `gcs-dashboard`가 gRPC endpoint를 직접 호출하지 않는지 확인

### P0. gRPC Exchange contract completion

목표:

- telemetry, stream event, command ack payload를 gateway request `oneof`로 고정한다.
- response는 accepted, rejected, backpressure, unauthorized, malformed를 명확히 구분한다.
- metadata는 `authorization` 또는 `x-gcs-gateway-token`만 허용한다.

검증:

- Go decoder malformed test
- Python wire round-trip test
- unauthorized metadata smoke
- max payload boundary test

### P0. Device publish authorization

목표:

- 미인가 로봇/드론이 WHIP/RTSP/telemetry를 직접 보내지 못하게 한다.
- Spring auth-policy가 device principal과 group scope를 판단한다.
- Go media-control이 short-lived media token과 publish path를 발급한다.

검증:

- token 없는 WHIP publish 거부
- 만료 token publish 거부
- 다른 group stream publish 거부
- 정상 token publish 성공

### P1. REST legacy route retirement

목표:

- Python `/stream/*`, `/control/*`, `/telemetry/*`의 active core 의존도를 낮춘다.
- 남기는 경로는 `Deprecation`, `X-GCS-Replacement-Route` header를 반드시 가진다.

검증:

- replacement route contract test
- dashboard가 legacy route를 직접 호출하지 않는지 test

### P1. PostgreSQL/PostGIS cutover preparation

목표:

- geometry, telemetry history, asset/group read model을 PostgreSQL/PostGIS bounded context로 이동한다.
- MySQL은 legacy/default에서 제거 방향으로 둔다.

검증:

- spatial index query plan
- latest state vs history 분리
- bulk flush/COPY 후보 benchmark
- MySQL compatibility path 제거 여부 추적

### P2. GraphQL read-model BFF evaluation

목표:

- event log, server status, stream telemetry, group tree를 한 화면에서 묶는 복합 read model만 GraphQL 후보로 검토한다.
- media path와 command path에는 GraphQL을 사용하지 않는다.

검증:

- REST aggregation 대비 request count와 payload size 비교
- auth-policy scope가 resolver마다 적용되는지 test

## 완료 판정

gRPC/Protobuf migration은 다음 조건을 모두 만족할 때 완료라고 부른다.

1. Browser dashboard가 필요한 기능은 REST/JSON, SSE, WHEP/HLS로 정상 동작한다.
2. Device gateway telemetry, stream event, command ack는 Protobuf contract로 round-trip 된다.
3. gRPC Exchange는 unauthorized, malformed, backpressure, reconnect case를 테스트한다.
4. media frame은 WebRTC/HLS/RTSP 전용 경로에만 존재한다.
5. Spring auth-policy와 Go media-control의 PDP/PEP 경계가 테스트로 고정된다.
6. Python legacy route는 replacement header와 함께 fallback으로만 남는다.
7. runtime smoke에서 publish, play, ICE, first-frame, telemetry ingest가 같은 경계표대로 흐른다.
