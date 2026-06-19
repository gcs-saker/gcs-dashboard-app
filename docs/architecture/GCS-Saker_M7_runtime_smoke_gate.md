# GCS-Saker M7 runtime smoke gate

## 목적
M7의 구조 이전은 코드 골격만 통과하면 안 된다. 인증/인가, STUN/TURN, MediaMTX, edge proxy, dashboard/backend 경로가 실제 런타임에서 함께 살아있는지 확인해야 한다. 이 문서는 #208의 런타임 검증 기준이다.

## 다음 이슈
#208 `M7-05. Single-node runtime smoke gate 및 폐쇄망 핵심 경로 검증`

이 이슈는 기존 #200 데이터 플랫폼 설계보다 먼저 수행한다. 이유는 데이터 저장소를 늘리기 전에 현재 single-node 폐쇄망 가정 compose가 실제로 뜨고, stream control plane이 살아있는지 확인해야 이후 성능 비교가 의미 있기 때문이다.

## 검증 단계
1. `--check`
   - compose 파일, nginx route, MediaMTX ICE 설정, Spring/Kotlin, Go service 파일 존재를 확인한다.
   - WebRTC SDP/ICE 정적 계약을 확인한다.
   - TURN long-term credential allocation 정적 계약을 확인한다.
   - Docker가 있으면 `docker compose config --quiet`까지 확인한다.
2. `--run`
   - single-node PoC stack을 기본 active runtime으로 띄운다.
   - edge의 `/healthz`, `/readyz`, `/stream/status`를 확인한다.
   - edge container 내부에서 `auth-policy`, `media-control`, `MediaMTX API`를 확인한다.
   - host에서 TURN primary/secondary allocation을 실제로 수행한다.

## 명령어
```bash
scripts/m7_single_node_runtime_smoke.sh --check
```

Docker 런타임까지 확인할 때:

```bash
scripts/m7_single_node_runtime_smoke.sh --run
```

기본적으로 `--run`은 로컬에 이미 떠 있는 운영/실험 컨테이너와 충돌하지 않도록 smoke 전용 포트를 사용한다. 실제 `.env.single-node`의 포트를 그대로 쓰고 싶으면:

```bash
USE_SMOKE_PORTS=0 scripts/m7_single_node_runtime_smoke.sh --run
```

검증 후 stack을 내리고 싶으면:

```bash
STOP_STACK=1 scripts/m7_single_node_runtime_smoke.sh --run
```

## 실제 스트림 데이터 확인 시점
이 게이트가 `--run`으로 통과되면 다음 이슈에서 실제 publish/play를 검증한다. 다음 이슈는 WebRTC WHIP/WHEP 또는 MediaMTX 지원 publish 경로로 테스트 스트림을 넣고, dashboard 선택창에서 stream을 선택해 수신되는지 확인하는 단계다.

## 성능 비교 기준
다음 단계부터는 다음 수치를 비교한다.

- backend stream API p50/p95 latency
- TURN allocation 성공 여부 및 primary/secondary failover
- WebRTC signaling 응답 시간
- HLS fallback manifest 도달 시간
- publish 시작 후 dashboard에서 첫 영상이 보이기까지 걸린 시간
- 기존 v0.2.0 Python 중심 구조와 M7 분리 구조의 API latency 차이

## 폐쇄망 기준
폐쇄망에서는 외부 `stun:stun.l.google.com:19302`에 의존하지 않는다. single-node 또는 서버 두 대 구성에서 coturn을 STUN/TURN으로 사용하고, `media-control`이 브라우저/송출 장치에 제공할 ICE server 후보를 관리한다.

## 남은 위험
- 이 이슈는 영상 frame이 실제로 dashboard player까지 도착하는 것을 증명하지 않는다.
- MediaMTX WHEP는 publish된 path가 없으면 signaling이 실패할 수 있다.
- TURN allocation 성공은 relay 후보 생성 가능성을 뜻하지만, 실제 media relay 성공은 WebRTC publish/play 이슈에서 확인해야 한다.

## 확인된 오류와 수정
- 오류: MediaMTX container가 `health: starting`에 머물렀다.
- 원인: `bluenviron/mediamtx:1.15.3` 이미지는 `/bin/sh`가 없는 최소 이미지인데 compose healthcheck가 `CMD-SHELL`을 사용했다.
- 수정: MediaMTX container healthcheck는 제거하고, `edge`와 `media-control`의 depends_on은 `service_started`로 낮췄다. 실제 준비 상태는 runtime smoke script가 `edge` 컨테이너 내부에서 `http://mediamtx:9997/v3/config/global/get`을 직접 호출해 검증한다.
- 오류: TURN allocation 테스트가 `438 stale nonce`를 반복했다.
- 원인: 테스트 클라이언트가 401 challenge 요청과 인증 Allocate 요청을 서로 다른 UDP socket으로 보내 source port가 바뀌었다. coturn은 nonce를 client 5-tuple 기준으로 검증하므로 다른 source port에서 같은 nonce를 쓰면 stale로 판단한다.
- 수정: `turn_relay_smoke.py`에 `TurnConnection`을 추가해 challenge부터 authenticated Allocate까지 같은 socket을 유지한다.
