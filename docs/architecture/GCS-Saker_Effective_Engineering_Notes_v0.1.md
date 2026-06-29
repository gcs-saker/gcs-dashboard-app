# GCS-Saker Effective Engineering Notes v0.1

이 문서는 GCS-Saker 개발 과정에서 실제로 적용했거나, 앞으로 같은 방향으로 지켜야 할 개발 지식을 Effective Java 스타일의 항목으로 정리한 것이다. 기준은 단순하다. 런타임에서 터질 수 있는 실수를 컴파일/테스트/구조 단계에서 먼저 막고, 스트리밍 시스템답게 인증, 세션, 시그널링, 미디어 경로를 가능한 한 예측 가능하게 유지한다.

## 1. 널브러진 값은 상수로 끌어올려라

문자열 endpoint, header 이름, token prefix, JSON field 이름, error detail은 코드 곳곳에 직접 쓰지 않는다.

적용 사례:

- Spring/Kotlin `auth-policy`는 `AuthApiRoutes.kt`, `TimeSyncApiRoutes.kt`, `OperationalReadApiRoutes.kt`처럼 API 도메인별 계약 파일에 endpoint, header, token, error, response field 계약값을 나누어 모았다.
- React dashboard는 `features/apiRoutes.ts`에서 auth/dashboard/stream endpoint를 관리한다.
- Go `media-control`은 HTTP route, JSON key, content type, error detail을 상수화했다.

효과:

- `/ops/time/status` 같은 경로가 바뀌어도 검색 지옥을 피한다.
- 테스트와 구현이 같은 계약값을 바라보므로 누락 가능성이 줄어든다.
- API 경계가 코드상에서 드러난다.

## 2. Endpoint는 컨트롤러에 흩뿌리지 말고 계약 파일에서 관리하라

`@GetMapping("/healthz")`처럼 컨트롤러에 문자열을 직접 넣는 방식은 초반에는 빠르지만, 서비스가 많아질수록 위험해진다.

적용 방식:

- `AuthApiRoutes`, `HealthApiRoutes`, `TimeSyncApiRoutes`, `OperationalEventApiRoutes`, `OperationalReadApiRoutes`, `StreamPolicyApiRoutes`로 route를 분리했다.
- 컨트롤러 annotation은 계약 객체만 참조한다.

효과:

- API surface를 한 파일에서 조망할 수 있다.
- Nginx route, frontend route, backend route를 비교하기 쉬워진다.
- DTO 분리와 API 문서화가 자연스럽게 이어진다.

## 3. DTO는 외부 계약이고, 도메인 객체는 내부 규칙이다

DTO는 JSON field명, 호환성, 외부 클라이언트와의 약속을 담당한다. 도메인 객체는 내부 불변 조건과 비즈니스 규칙을 담당한다. 둘을 섞지 않는다.

적용 사례:

- `TokenResponse`, `UserResponse`, `StreamAccessResponse`, `TelemetryReadResponse`는 API DTO다.
- `AuthUser`, `SignupInvite`, `GroupId`, `StreamSessionDescriptor`는 도메인 모델이다.
- JSON field명은 `AuthApiFields`, `OperationalReadApiFields`, `StreamPolicyApiFields`처럼 API 도메인별 field contract로 분리했다.

원칙:

- DTO에는 외부 호환성 때문에 필요한 field명을 명확히 둔다.
- 도메인 객체에는 `require(...)`로 생성 시점 검증을 둔다.
- 변환 함수는 `toResponse()`처럼 경계에서만 둔다.

## 4. 원시 컬렉션 대신 일급 컬렉션을 사용하라

`Set<String>`이나 `List<SignupInvite>`를 설정/도메인 경계에 그대로 흘려보내면 의미가 흐려진다. 컬렉션에 이름과 규칙을 부여하라.

적용 사례:

- `AllowedOrigins`는 origin 목록을 trim/filter하고 읽기 전용 API만 제공한다.
- `SignupInvites`는 초대코드 중복을 생성 시점에 막고 `findByCode()`만 공개한다.

효과:

- “그냥 문자열 목록”이 아니라 “허용 Origin 집합”이라는 의미가 생긴다.
- 중복 초대코드 같은 오류를 런타임 중간이 아니라 생성 시점에 차단한다.
- 외부에서 내부 컬렉션을 직접 바꾸지 못한다.

## 5. 객체는 만들 때 검증하고, 만든 뒤에는 가능한 한 바꾸지 마라

불변 객체는 동시성, 테스트, 디버깅에서 큰 이득을 준다.

적용 방식:

- Kotlin은 `data class`, `val`, private backing collection을 기본으로 둔다.
- 생성자 또는 factory method에서 `require(...)`로 불변 조건을 검증한다.
- 외부에는 `toSet()`, `toList()`처럼 복사본을 반환한다.
- TypeScript는 `Object.freeze`, `Readonly`, `readonly` 배열을 사용한다.

예시 원칙:

- `AllowedOrigins.of(...)`처럼 생성 함수를 통해 정규화된 객체만 만들게 한다.
- `LEGACY_AUTH_STORAGE_KEYS`, `AUTH_JSON_HEADERS`, `AUTH_ROUTES`는 `Object.freeze`로 고정한다.

## 6. 구현체보다 부모 타입 또는 인터페이스에 의존하라

Java식으로 말하면 다음 원칙이다.

```java
ParentType value = new ChildType();
```

Kotlin에서는 다음처럼 적용한다.

```kotlin
val repository: AuthUserRepository = InMemoryAuthUserRepository(emptyList())
```

적용 이유:

- 테스트에서 구현체 교체가 쉬워진다.
- Redis/MySQL/인메모리 구현을 갈아 끼우는 구조가 된다.
- auth-policy, media-control 같은 서비스 경계가 더 단단해진다.

적용 사례:

- `AuthUserRepository`, `PrincipalCache`, `RefreshSessionStore` 같은 인터페이스를 통해 구현체를 숨겼다.
- Redis를 붙여도 호출부는 `RefreshSessionStore`만 바라보게 했다.

## 7. Singleton은 상태가 없거나 명확히 공유되어야 할 때만 사용하라

세션, refresh token, stream registry처럼 사용자별/시간별 상태가 있는 곳에 무리하게 Singleton을 도입하면 병목과 보안 문제가 생긴다.

권장 방향:

- 상태 없는 상수/정책 객체는 `object` 또는 singleton으로 둔다.
- 세션 저장소는 singleton 자체보다 인터페이스와 lifecycle 관리가 중요하다.
- Redis-backed store처럼 외부 저장소를 둔 구현체를 DI container가 관리하게 한다.

적용 사례:

- `NoopPrincipalCache`, `StatelessRefreshSessionStore`는 상태가 없으므로 singleton object가 적합하다.
- `RedisRefreshSessionStore`는 Redis 연결과 TTL 정책을 가진 구현체로 DI에서 관리한다.

## 8. Factory Method는 생성 규칙이 있는 객체에 사용하라

생성할 때 trim, filter, 중복 검증, 기본값 보정이 필요하면 public constructor보다 factory method가 안전하다.

적용 사례:

- `AllowedOrigins.of(origins)`
- `SignupInvites.of(invites)`

권장 후보:

- `IceServerList.of(rawServers)`
- `StreamRoutePolicies.of(policies)`
- `TelemetrySamples.of(rawTelemetry)`
- `AuthHeaders.withBearer(token)`

주의:

- Factory manager를 과하게 만들면 오히려 흐름이 숨는다.
- 생성 규칙이 실제로 복잡해지는 시점에 도입한다.

## 9. Generic은 타입 오사용을 막을 때만 사용하라

Generic은 멋으로 쓰는 것이 아니라 잘못된 타입이 들어오지 못하게 하는 장치다.

권장 사용처:

- `StoredAuthSession<TUser>`
- API response parser
- 일급 컬렉션의 내부 item 타입
- 공통 repository/read model 경계

주의:

- Kotlin의 variance, Java의 wildcard/super 개념은 컬렉션 생산/소비 경계가 분명할 때 사용한다.
- 단순 DTO에 generic을 남발하면 읽기 어려운 코드가 된다.

## 10. 동시 실행되면 안 되는 메서드는 코드와 테스트로 모두 막아라

인증/가입/refresh token 소비 같은 경로는 동시에 실행될 때 문제가 생길 수 있다.

적용 사례:

- `InMemoryAuthUserRepository.save()`는 `@Synchronized`로 duplicate username/email 저장 경쟁을 막는다.
- 동시에 같은 username으로 저장하는 테스트를 추가해 회귀를 막았다.

추가 적용 후보:

- refresh token consume은 Redis atomic operation으로 관리한다.
- stream session 등록/해제는 같은 stream id에 대해 idempotent하게 처리한다.
- media-control cache update는 TTL과 lock 범위를 명확히 둔다.

## 11. Refresh token은 재사용을 막고, access token은 짧게 가져가라

세션 보안의 기본은 access token은 짧게, refresh token은 안전하게, 재사용은 차단하는 것이다.

적용 사례:

- access token은 frontend memory에만 보관한다.
- refresh token은 HttpOnly cookie로 내려간다.
- Redis refresh session store를 통해 refresh token consume/revoke를 관리한다.
- CSRF header와 Origin/Referer 검증을 함께 사용한다.

효과:

- XSS가 발생해도 localStorage에서 token을 바로 빼가기 어렵다.
- CSRF성 요청은 custom header와 Origin 정책으로 걸러진다.

## 12. LocalStorage에 인증 토큰을 넣지 마라

localStorage는 편하지만 XSS에 취약하다.

적용 사례:

- `authStorage.ts`는 access token/user metadata를 memory-only로 전환했다.
- 기존 legacy key는 읽는 시점에 삭제한다.

원칙:

- access token: memory
- refresh token: HttpOnly cookie
- user/session metadata: 가능하면 server 확인 또는 memory

## 13. Custom Header는 단독 방어책이 아니라 방어 계층이다

`X-GCS-CSRF: same-origin` 같은 custom header는 CSRF 방어에 도움이 되지만 혼자 충분하지 않다.

함께 적용해야 할 것:

- HttpOnly cookie
- SameSite
- Origin/Referer 검증
- CORS allowlist
- HTTPS

현재 적용:

- 프론트 인증 요청은 공통 header 상수를 사용한다.
- 백엔드는 변경성 auth endpoint에서 CSRF header를 검증한다.
- Spring `@RequestHeader`는 Kotlin annotation class에 meta-annotation으로 합성하기 어렵기 때문에, custom annotation 대신 `AuthSecurityHeaders` 상수를 사용해 계약값을 고정했다.

## 14. 테스트는 구현 의도까지 고정해야 한다

테스트는 “지금 된다”만 확인하는 도구가 아니라 “이 설계 의도를 깨뜨리지 말라”는 문서다.

적용 사례:

- CSRF header 누락 시 403
- localStorage에 token이 남지 않음
- refresh session 재사용 거부
- 동시 duplicate username 저장 시 하나만 성공
- Go media-control route와 response contract
- 프론트 API route 변경 후 전체 test/build/coverage

원칙:

- unit test는 작은 규칙을 고정한다.
- integration test는 서비스 경계와 인증 흐름을 검증한다.
- smoke test는 실제 실행/스트리밍 경로를 확인한다.

## 15. 스트리밍 경로는 API보다 더 엄격하게 검증하라

API가 200이어도 signaling/ICE/media track이 실패하면 스트리밍은 실패다.

이미 확인한 기준:

- WHIP/WHEP signaling
- ICE candidate 수집
- STUN/TURN fallback
- 8189 media port 필요성
- first-frame smoke
- HLS fallback 준비

앞으로 필요한 기준:

- end-to-end publish-to-view latency
- reconnect 감지
- stream offline 감지

## 16. LLM 코딩은 속도보다 명확성을 우선하라

LLM 기반 개발은 빠르지만, 추측성 구현과 과도한 추상화가 섞이기 쉽다. GCS-Saker에서는 모든 LLM 코딩, 리팩터링, 코드 검증 작업에 다음 기준을 기본 prompt처럼 적용한다.

코딩 전에 해야 할 일:

- 가정을 명확히 밝힌다.
- 해석이 여러 개인 경우 가능한 해석을 먼저 드러낸다.
- 더 단순한 방법이 있으면 함께 말한다.
- 이해가 안 되는 요구사항은 숨기지 않고 멈춰서 질문한다.
- 변경 목표를 검증 가능한 문장으로 바꾼다.

단순성 기준:

- 요청한 기능 외의 추측성 기능을 넣지 않는다.
- 일회성 문제에는 추상화를 만들지 않는다.
- 필요하지 않은 설정 가능성, 확장성, 오류 처리를 넣지 않는다.
- 같은 결과를 50줄로 만들 수 있으면 200줄 구현은 다시 줄인다.

수술적 변경 기준:

- 요청과 직접 연결된 파일과 줄만 수정한다.
- 인접 코드, 주석, 포맷을 이유 없이 개선하지 않는다.
- 기존 스타일을 우선 따른다.
- 새 변경 때문에 생긴 unused import, 변수, 함수는 제거한다.
- 기존에 있던 무관한 unused code는 삭제하지 않고 별도 이슈나 보고로 남긴다.

목표 중심 검증:

- 버그 수정은 재현 테스트를 먼저 만들거나 최소한 실패 조건을 명확히 고정한다.
- 리팩터링은 전후 테스트가 모두 통과해야 완료로 본다.
- 보안/인증/스트리밍 경로는 unit test만으로 닫지 않고 integration 또는 runtime smoke를 포함한다.
- PR 설명에는 문제 원인, 수정 경로, 검증 결과, 남은 위험을 한국어로 남긴다.

적용 예:

- “Redis 장애 복원력 추가”는 “Redis principal cache 실패 시 API는 지속되고 operational event가 남으며, refresh session consume 실패는 fail-closed 된다”로 바꿔 검증한다.
- “Spring Security 도입”은 “public route는 인증 없이 열리고 protected route는 Bearer token 없이는 401로 막힌다”로 바꿔 검증한다.
- “프론트 E2E 추가”는 “mock API 환경에서 로그인, 대시보드 진입, 스트림 선택, 운영 이벤트 표시가 브라우저에서 재현된다”로 바꿔 검증한다.
- audio track 수신 여부
- GPS telemetry와 stream session 매핑

## 16. 성능 최적화는 “빠르게 보이기”와 “덜 일하기”를 나눠라

프론트 최적화는 단지 체감 문제가 아니라 장기 운영에서 메모리 누수를 막는 일이다.

적용/검토한 기준:

- 과도한 `useEffect` 방지
- 여러 `useState`를 reducer 또는 객체 상태로 정리
- custom hook으로 streaming playback 관심사 분리
- lazy loading으로 HLS/3D/map chunk 분리
- player는 stream 원본 크기가 아니라 container에 맞춰 렌더링

앞으로 필요한 기준:

- React render profiler 도입 검토
- TanStack Query/Zustand 혼합 전략
- 불필요한 polling 간격 조정
- stream status/event log는 polling보다 push 구조 검토

## 17. DB 튜닝은 쿼리 수, 인덱스, 실행 계획을 함께 고정하라

성능을 올릴 때는 “느낌상 빠름”이 아니라 DB round-trip, rows examined, 실행 계획으로 검증한다.

적용 사례:

- signup 중복 검사는 username 조회와 email 조회를 하나의 OR query로 합쳤다.
- signup 중복 검사는 row 조회가 아니라 `EXISTS` index probe로 처리해 불필요한 user row materialization을 피한다.
- login/refresh/gateway/company 조회는 필요한 column만 projection한다.
- gateway asset 조회는 mapping 조회 후 `IN (...)` 조회를 join query로 합쳤다.
- MySQL/MariaDB telemetry ingest는 `ON DUPLICATE KEY UPDATE` atomic upsert로 select-then-update race window와 불필요한 선행 조회를 줄인다.
- `gateway_assets.asset_id` reverse lookup index contract를 추가했다.
- Python test에서 signup duplicate email path가 `EXISTS`만 수행하는지, login이 인증에 필요한 column만 읽는지, asset 조회가 gateway id projection + join 조회로 고정되는지 검증한다.

운영 절차:

- 운영 DB에서는 `EXPLAIN ANALYZE`, `SHOW INDEX`, `ANALYZE TABLE` 순서로 확인한다.
- 자세한 실행 순서와 기대 연산 감소는 [GCS-Saker_DB_Query_Tuning_Guide_v0.1.md](../operations/GCS-Saker_DB_Query_Tuning_Guide_v0.1.md)를 기준으로 한다.

## 17. 운영 상태는 단일 “서버 상태”가 아니라 구성요소별로 보라

운영자는 “서버 상태 정상”보다 어떤 구성요소가 문제인지 알아야 한다.

분리 기준:

- API server
- auth-policy
- media-control
- MediaMTX signaling
- TURN
- DB
- Redis
- Nginx edge

적용 사례:

- dashboard server status는 API, auth, signaling, readiness, streams를 분리해서 표시한다.
- event log는 severity/time/query 기반 필터링으로 확장 중이다.

## 18. 폐쇄망 기준으로도 동작할 수 있게 설계하라

공개 API 의존은 편하지만 납품형 시스템에서는 위험하다.

설계 기준:

- 지도는 외부 tile API에만 의존하지 않는다.
- STUN/TURN은 자체 서버를 기본 후보로 둔다.
- 시간 동기화는 public/closed-network/manual 모드를 둔다.
- npm/pip/docker image는 offline packaging 전략을 둔다.

효과:

- 공개망/폐쇄망/복합망 모두에 대응할 수 있다.
- 군/산업 현장 납품 시 네트워크 제약을 덜 탄다.

## 19. 상속은 “대체 가능성”이 있을 때만 사용하라

상속은 타입 오사용을 막고 다형성을 줄 때 유용하지만, 단순 코드 재사용을 위해 쓰면 결합도가 올라간다.

권장:

- 인터페이스 기반 의존: `AuthUserRepository`, `RefreshSessionStore`
- 전략 패턴: Redis-backed store vs stateless store
- adapter 패턴: auth-policy client, MediaMTX client

주의:

- 데이터만 담는 DTO에 상속을 남발하지 않는다.
- 공통 필드를 위해 무리한 base class를 만들지 않는다.

## 20. PR에는 “무엇을 했는가”보다 “왜 필요했는가”를 적어라

팀이 Codex에게만 의존하지 않으려면, PR은 교육 자료가 되어야 한다.

PR에 남길 것:

- 어떤 문제가 있었는지
- 어느 파일/라인 성격에서 문제가 났는지
- 왜 그 방식으로 수정했는지
- 이슈 조건을 어떻게 만족했는지
- 테스트는 무엇을 실행했는지

채팅 보고에 남길 것:

- 테스트 통과 수치
- coverage 수치
- 실패 원인과 해결
- 아직 불안한 부분
- 다음 사람이 확인해야 할 개발 포인트

## 현재까지 실제 적용된 주요 패턴

### Strategy Pattern

사용 위치:

- `PrincipalCache`
- `RefreshSessionStore`
- Go `StreamAuthorizer`
- Go `StreamLister`

효과:

- Redis, no-op, stateless 구현을 호출부 변경 없이 교체할 수 있다.

### Adapter Pattern

사용 위치:

- Go auth-policy client
- MediaMTX client
- frontend API 함수들

효과:

- 외부 서비스의 응답/오류를 내부 도메인 모델로 변환한다.

### Factory Method

사용 위치:

- `AllowedOrigins.of(...)`
- `SignupInvites.of(...)`

효과:

- 생성 시점 정규화와 검증을 한 곳에 모은다.

### First-Class Collection

사용 위치:

- `AllowedOrigins`
- `SignupInvites`

효과:

- 원시 컬렉션에 의미와 규칙을 부여한다.

### Singleton Object

사용 위치:

- `NoopPrincipalCache`
- `StatelessRefreshSessionStore`
- Kotlin `object` contract classes

효과:

- 상태가 없거나 공유해도 안전한 객체를 명확히 표현한다.

### Template Method 후보

아직 본격 적용하지 않았다.

적용 후보:

- health/readiness check pipeline
- stream validation pipeline
- telemetry ingest validation pipeline

단, 지금은 인터페이스/전략 기반이 더 단순하다.

### Command Pattern 후보

일부 적용:

- `SignupCommand`
- `UpdateTimeSyncConfigCommand`

확장 후보:

- asset control command
- stream publish command
- group permission grant/revoke command

## 다음 리팩터링 권장 순서

1. DTO 파일 분리: auth/time/ops/telemetry/stream policy DTO를 컨트롤러에서 분리한다.
2. API contract test 강화: route contract와 DTO field contract를 별도 테스트로 고정한다.
3. 일급 컬렉션 확대: stream list, route policies, ICE server list에 적용한다.
4. 동시성 테스트 확대: refresh token consume, stream registry update, telemetry upsert에 적용한다.
5. factory method 정리: 생성 규칙이 있는 domain object의 public constructor 노출을 줄인다.
6. frontend state contract 정리: API route, query key, status enum을 상수/readonly 객체로 모은다.
7. 운영 안정성 테스트: 재시작, Redis 장애, TURN 장애, MediaMTX 장애 시 degraded behavior를 고정한다.

## 짧은 팀 규칙

- 문자열 계약값은 한 곳에 둔다.
- DTO와 도메인 객체를 섞지 않는다.
- 원시 컬렉션을 의미 있는 객체로 감싼다.
- 생성 시점에 검증하고 이후에는 바꾸지 않는다.
- 구현체보다 인터페이스에 의존한다.
- Singleton은 상태 없는 객체에만 쓴다.
- Factory는 생성 규칙이 있을 때 쓴다.
- 동시성 위험은 lock과 테스트로 같이 막는다.
- 인증 토큰은 localStorage에 두지 않는다.
- 스트리밍은 API 200이 아니라 first frame과 media track까지 검증한다.
- PR은 팀이 배울 수 있게 쓴다.
