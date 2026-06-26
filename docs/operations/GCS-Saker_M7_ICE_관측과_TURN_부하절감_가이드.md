# GCS-Saker M7 ICE 관측과 TURN 부하 절감 가이드

## 목적

WebRTC streaming은 HTTP API가 200을 반환해도 실제 media가 어떤 network path를 탔는지 확인하지 않으면 성능과 비용을 판단할 수 없다.

M7의 기준은 다음과 같다.

- STUN direct path를 먼저 시도한다.
- TURN relay는 direct path가 실패할 때 사용하는 fallback이다.
- dashboard, smoke script, benchmark report가 같은 ICE metric 이름을 사용한다.
- TURN 서버를 더 강하게 만들기 전에 relay ratio를 먼저 낮춘다.

## 관측해야 하는 값

| metric | 의미 | 운영 판단 |
| --- | --- | --- |
| `selected_local_candidate_type` | browser/local selected candidate type | `srflx` 또는 `host`면 direct 가능성이 높다. |
| `selected_remote_candidate_type` | MediaMTX/remote selected candidate type | `relay`면 서버 또는 NAT 쪽 direct path가 실패한 것이다. |
| `selected_ice_protocol` | selected pair protocol | `udp`가 기본 목표다. `tcp` 반복은 방화벽/망 정책을 확인한다. |
| `ice_rtt_ms` | selected pair RTT | media 지연, audio delay, first-frame 지연 원인을 분리한다. |
| `direct_ratio` | 측정 session 중 direct path 비율 | 값이 높을수록 TURN relay 대역폭과 port 사용량이 줄어든다. |
| `relay_ratio` | 측정 session 중 TURN relay 비율 | TURN capacity 산정의 핵심 지표다. |
| `relay_fallback_reason` | relay path 선택 이유 | 후보 미노출, UDP 차단, symmetric NAT, selected pair 미수집을 구분한다. |

## smoke 실행

정적 계약 확인:

```bash
python3 scripts/webrtc_ice_smoke.py --check
```

live WHEP 확인:

```bash
python3 scripts/webrtc_ice_smoke.py \
  --run \
  --whep-url https://a4ai.tplinkdns.com/webrtc/raw/sample/front/whep \
  --ice-server-url stun:stun.l.google.com:19302 \
  --require-connected \
  --require-video-frame \
  --insecure
```

자체 TURN relay path를 확인할 때는 `--ice-server-url`에 `turn:` URL과 credential을 환경 변수로 주입한다. credential은 명령 기록, 문서, PR에 남기지 않는다.

## fallback 원인 해석

| fallback reason | 의미 | 우선 확인할 것 |
| --- | --- | --- |
| `selected_pair_unavailable` | browser/aiortc stats에서 selected pair를 얻지 못했다. | smoke 환경, browser stats 권한, 연결 완료 여부 |
| `local_selected_relay_candidate` | local/browser 쪽이 TURN relay를 선택했다. | client NAT, UDP egress, corporate firewall |
| `remote_selected_relay_candidate` | remote/MediaMTX 쪽이 relay를 선택했다. | MediaMTX public candidate, 8189/UDP, edge proxy |
| `both_sides_selected_relay_candidate` | 양쪽 모두 relay candidate를 선택했다. | symmetric NAT 또는 양방향 UDP 차단 |
| `server_reflexive_candidate_unavailable` | srflx 후보가 수집되지 않았다. | STUN reachability, ICE server list, closed-network STUN |
| `direct_candidate_failed_relay_selected` | direct 후보는 있었지만 connectivity check가 실패했다. | NAT mapping, firewall, packet loss |

## TURN 부담 절감 순서

1. `scripts/webrtc_ice_smoke.py --run`으로 selected pair와 RTT를 확인한다.
2. `relay_ratio`가 높으면 TURN 서버 증설보다 candidate 품질을 먼저 확인한다.
3. remote candidate가 relay로 잡히면 MediaMTX public candidate와 8189/UDP 경로를 확인한다.
4. protocol이 `tcp`로 잡히면 UDP 차단 여부를 먼저 확인한다.
5. media-control의 ICE server list는 STUN 후보를 유지하면서 건강한 TURN 후보를 기본 1개로 제한한다.
6. primary TURN 장애 시 secondary TURN이 선택되는지는 `services/media-control/internal/turn` 테스트가 고정한다.
7. relay session만 bitrate/fps downshift 정책을 적용할 수 있도록 stream policy와 연결한다.

## 완료 기준

- static smoke에서 selected ICE pair, direct ratio, relay ratio 계약이 출력된다.
- benchmark schema에 `icePathMetrics`가 포함된다.
- Go media-control test가 healthy TURN 후보 제한과 primary/secondary fallback을 검증한다.
- dashboard와 운영 이벤트는 `icePath`, `relayFallbackReason`, `icePathCounts`를 계속 유지한다.
