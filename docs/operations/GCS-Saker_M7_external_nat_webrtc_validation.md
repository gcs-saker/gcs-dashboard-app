# GCS-Saker M7 외부 NAT STUN/TURN/WebRTC 검증

## 목적

외부 NAT 환경의 sender/receiver가 public edge를 통해 WHIP/WHEP signaling을 수행하고, 자체 STUN/TURN 후보로 ICE media path를 만들 수 있는지 검증한다.

## 검증 범위

- public edge readiness: `/healthz`, `/readyz`, `/media-control/readyz`
- ICE server API: `/media-control/api/v1/streams/ice-servers`
- TURN primary allocation: `turn:<host>:3478?transport=udp`
- TURN secondary allocation: `turn:<host>:3479?transport=udp`
- WHIP publish: `https://<host>/webrtc/<stream>/whip`
- WHEP playback: `https://<host>/webrtc/<stream>/whep`
- first-frame latency, WHEP answer latency, ICE gathering/connection state
- WHEP/WHIP SDP candidate summary: host/srflx/relay, private-or-loopback/public-or-DNS count
- UDP 제한/relay-only 모드: `RELAY_ONLY=1`로 TURN primary URL만 ICE server로 사용한다.

## 실행

```bash
WEBRTC_TURN_USERNAME=... \
WEBRTC_TURN_PASSWORD=... \
EDGE_BASE_URL=https://a4ai.tplinkdns.com \
STREAM_PATH=raw/nat/smoke \
scripts/m7_external_nat_webrtc_smoke.sh --run
```

자체서명 인증서 환경에서는 기본값으로 `INSECURE_TLS=1`이 적용된다. 정식 인증서 전환 뒤에는 `INSECURE_TLS=0`으로 검증한다.

relay-only 검증은 다음처럼 실행한다.

```bash
RELAY_ONLY=1 \
WEBRTC_TURN_USERNAME=... \
WEBRTC_TURN_PASSWORD=... \
scripts/m7_external_nat_webrtc_smoke.sh --run
```

## 통과 기준

- edge readiness와 media-control readiness가 200을 반환한다.
- primary/secondary TURN allocation이 각각 XOR-RELAYED-ADDRESS를 반환한다.
- WHIP answer를 받고 publisher ICE state가 connected/completed에 도달한다.
- WHEP answer를 받고 receiver ICE state가 connected/completed에 도달한다.
- receiver가 첫 video frame을 수신하고 latency 수치를 출력한다.

## 결과 해석

| 지표 | 의미 | 다음 확인 |
| --- | --- | --- |
| TURN allocation latency | relay 후보를 만들 수 있는지 | 포트포워딩, credential, realm |
| WHIP answer latency | 송출 signaling round trip | edge `/webrtc/` proxy, MediaMTX WHIP |
| WHEP answer latency | 수신 signaling round trip | stream publish 상태, MediaMTX WHEP |
| Candidate summary | SDP 후보가 public/relay 중심인지 | `MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES`, `MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS` |
| First video frame latency | publish-to-play 체감 지연 | ICE path, codec, encoder, 네트워크 RTT |
| Relay-only result | 직접 후보가 막힌 환경의 복구성 | TURN relay range, UDP 정책 |

## 제한

이 smoke는 Codex/운영자 단말이 서버 밖 NAT에 있다고 가정하고 실행한다. 서로 다른 두 외부망의 sender/receiver까지 검증하려면 한 단말은 publisher page를 열고, 다른 단말은 dashboard 또는 WHEP smoke를 실행해 같은 지표를 기록한다.
