# GCS-Saker M7 DragonFly Compatibility Profile

## 목적

M7 runtime migration에서는 Redis를 즉시 제거하지 않는다. 기본 runtime은 Redis 7.4를 유지하고, DragonFly는 Redis-compatible cache/session runtime 후보로 별도 compose override에서 검증한다.

검증 대상은 아래 네 가지 경로다.

- Spring/Kotlin auth-policy principal cache
- Spring/Kotlin refresh session store
- Go media-control ICE server list cache
- Go media-control stream presence cache

media frame, WebRTC RTP packet, HLS segment는 Redis/Dragonfly에 올리지 않는다. cache runtime은 control plane과 latest state만 담당한다.

## 적용 방식

기본 실행은 기존과 같다.

```bash
docker compose --env-file deploy/compose/.env.single-node \
  -f deploy/compose/compose.single-node.poc.yml \
  up -d
```

Dragonfly 후보 검증 시에만 override를 추가한다.

```bash
docker compose --env-file deploy/compose/.env.single-node \
  -f deploy/compose/compose.single-node.poc.yml \
  -f deploy/compose/compose.dragonfly.override.yml \
  up -d
```

override는 `redis` 서비스 이름을 유지한다. 따라서 Spring과 Go 서비스는 `redis:6379` 주소 계약을 그대로 사용하고, runtime만 Dragonfly로 바뀐다.

## 검증된 cache command subset

`scripts/dragonfly_profile_smoke.py --run`은 기본 Redis profile과 DragonFly override profile을 각각 격리된 compose project로 띄운 뒤 같은 Redis RESP command subset을 실행한다.

- `AUTH`: 내부 cache runtime 인증
- `PING`: cache runtime 기본 응답성
- `SETEX`: 짧은 TTL principal/session/ICE/stream cache 저장
- `GET`: principal, ICE list, stream list, stream presence 조회
- `GETDEL`: refresh token 1회성 consume 보장
- `TTL`: principal cache TTL 보장
- `DEL`: smoke key 정리

이 subset은 현재 코드가 실제로 사용하는 범위에 맞춘다. Redis/DragonFly가 더 많은 command를 지원하더라도, GCS-Saker가 쓰지 않는 command까지 production readiness로 주장하지 않는다.

## 검증되는 key 계약

- `auth-policy` principal cache: access token 원문을 저장하지 않고 hash key에 principal payload를 짧게 저장한다.
- `auth-policy` refresh session: refresh token hash key를 `GETDEL`로 한 번만 consume한다.
- `media-control` ICE cache: healthy ICE server list JSON을 짧게 저장한다.
- `media-control` stream cache: stream list JSON과 stream presence status를 짧게 저장한다.

media frame, RTP packet, HLS segment는 cache runtime으로 보내지 않는다.

## 장애 및 degraded behavior

- `media-control` stream/ICE cache는 cache miss 또는 cache 장애 시 upstream registry를 직접 조회하고 degraded metric을 남긴다.
- `auth-policy` principal cache는 best-effort 성격이라 access token 검증 자체를 cache에 의존하지 않는다.
- `auth-policy` refresh session은 refresh 재사용 방지를 위한 authoritative store다. 이 경로는 cache 장애 시 조용히 우회하면 안 되며, readiness에서 운영자가 볼 수 있게 실패해야 한다.

## 운영 전 확인 사항

- `DRAGONFLY_IMAGE`는 운영 배포 전 반드시 특정 digest 또는 version tag로 고정한다.
- DragonFly는 BSL 1.1로 배포된다. DragonFly 공식 문서는 self-hosted production 사용은 가능하되, DragonFly 자체를 managed in-memory data-store service로 제공하지 않는 조건을 설명한다.
- 납품/폐쇄망 환경에서는 고객 계약과 라이선스 해석을 별도로 확인한다.
- Dragonfly 공식 Docker 문서는 최소 4GB RAM, CPU 1 core, Linux kernel 4.19 이상을 전제로 한다.
- Docker Compose 환경에서는 container network mode에 따라 성능 비용이 생길 수 있으므로 local bridge, host network 후보, 실제 서버 network를 분리해 benchmark한다.
- Dragonfly image 내부에 `redis-cli`가 항상 있다고 가정하지 않는다. 그래서 compose healthcheck는 disable하고 application readiness와 외부 redis protocol smoke로 확인한다.

## 기대 효과와 한계

기대 효과:

- Redis protocol을 유지하므로 Spring Data Redis와 Go RESP client 변경을 최소화한다.
- refresh session, principal cache, ICE list, stream presence처럼 짧은 TTL key가 많은 경로에서 대체 runtime benchmark가 가능하다.
- Redis 병목이 실제인지, application/DB/network 병목인지 분리해서 볼 수 있다.

한계:

- WebRTC media latency 자체를 직접 줄이지는 않는다.
- TURN relay 부하를 줄이는 효과는 ICE server list 조회, stream presence update 같은 control plane에 한정된다.
- Redis command 호환성은 사용하는 command subset 기준으로 검증해야 한다.
- 기본 runtime 승격 전에는 Redis 대비 tail latency, memory, CPU, restart recovery, persistence behavior를 같은 서버에서 비교해야 한다.

## 테스트 기준

- compose config가 Redis 기본 profile과 Dragonfly override profile 모두 통과한다.
- auth-policy `/healthz`, `/readyz`에서 cache runtime 장애를 명확히 degraded 상태로 표현한다.
- media-control stream list는 cache runtime 장애 시 MediaMTX upstream 조회로 fallback한다.
- refresh token consume은 Redis/Dragonfly 모두에서 재사용을 거부해야 한다.
- stream presence는 publisher disconnect 후 TTL 안에서 stale/online 상태가 정리되어야 한다.

## 참고

- DragonFly license: https://www.dragonflydb.io/docs/about/license
- DragonFly FAQ: https://www.dragonflydb.io/docs/about/faq
