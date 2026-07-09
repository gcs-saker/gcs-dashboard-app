# GCS-Saker M10 Spring Modulith Boundary

## 목적

`auth-policy`는 단일 Spring/Kotlin 서비스 안에서 인증, 그룹 정책, 운영 이벤트, telemetry read model, 시간 동기화를 함께 다룬다.
MSA로 즉시 쪼개기 전에 package boundary와 의존 방향을 테스트로 고정해 단일 책임 원칙이 무너지지 않게 한다.

## 현재 모듈

| module | 책임 | 허용 의존 |
| --- | --- | --- |
| `api` | HTTP/GraphQL/SSE 연결, DTO mapping, controller orchestration | `application`, `configuration`, `domain`, `observability` |
| `application` | audit publishing, MQTT bridge, 실패 이벤트 생성 같은 use-case orchestration | `domain`, `protocol` |
| `configuration` | runtime settings, bean assembly, seed data, repository factory | `application`, `domain`, `infrastructure`, `observability` |
| `domain` | 인증 모델, 그룹 정책, 장비 identity, 운영 read model, 시간 동기화 모델 | 없음 |
| `infrastructure` | JDBC/JPA/Redis adapter, schema migration support, resilience adapter | `application`, `domain` |
| `observability` | trace, metric, observation naming | 없음 |
| `protocol` | protobuf/gRPC wire 계약과 protocol DTO | `domain` |

## 경계 원칙

- Controller는 HTTP 연결과 orchestration만 담당한다.
- Domain은 Spring Web, Redis, JDBC 같은 infrastructure 세부 구현을 참조하지 않는다.
- Protocol은 wire format과 domain 변환만 담당하고 API controller나 persistence adapter를 직접 참조하지 않는다.
- Infrastructure는 domain port를 구현하며, business policy를 새로 판단하지 않는다.
- Group hierarchy와 stream access 정책은 `domain`의 `GroupPolicyService`에 둔다.
- 운영 장애, security audit 같은 cross-cutting 기록은 `application` 또는 `observability` 경계에서 다룬다.

## 검증 방법

- `SpringModulithBoundaryTest`
  - `ApplicationModules.of(AuthPolicyApplication::class.java).verify()`로 선언된 Modulith 의존 방향을 검증한다.
  - 노출되는 module 이름이 `api`, `application`, `configuration`, `domain`, `infrastructure`, `observability`, `protocol`에 머무는지 고정한다.
- `BoundedContextBoundaryTest`
  - auth API가 stream/ops/telemetry/time controller를 직접 orchestration하지 않는지 확인한다.
  - stream policy API가 operational read repository를 직접 참조하지 않는지 확인한다.
  - protocol package가 API 또는 infrastructure adapter를 참조하지 않는지 확인한다.

## 운영상 의미

이 경계가 유지되면 인증/인가, 장비 정책, telemetry read model, event logging이 커져도 한 controller 또는 한 adapter에 책임이 쌓이지 않는다.
추후 PostgreSQL/PostGIS, MQTT/gRPC, AI sidecar, GraphQL BFF가 추가되어도 각 기능은 기존 module contract를 통해 붙고, 역방향 의존이 생기면 테스트에서 먼저 드러난다.
