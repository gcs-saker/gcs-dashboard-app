# GCS-Saker M7 UDP/conntrack 튜닝 가이드

## 목적
WebRTC direct/STUN과 TURN relay는 모두 UDP packet 흐름에 민감하다. 서버의 UDP buffer, ephemeral port range, conntrack table이 작으면 애플리케이션은 정상이어도 ICE 연결 지연, first frame 지연, 오디오 끊김, relay allocation 실패처럼 보일 수 있다.

## 점검 스크립트

```bash
scripts/ops/server_udp_tuning_check.sh
```

이 스크립트는 값을 변경하지 않고 현재 sysctl 값과 권장 기준만 출력한다.

| 항목 | 권장 기준 | 이유 |
| --- | --- | --- |
| `net.core.rmem_max` | `16777216` 이상 | UDP 수신 burst를 흡수해 packet drop 가능성을 낮춘다. |
| `net.core.wmem_max` | `16777216` 이상 | TURN relay 송신 burst에서 socket buffer 부족을 줄인다. |
| `net.netfilter.nf_conntrack_max` | `262144` 이상 | 다중 NAT/WebRTC 연결 추적 table 고갈을 늦춘다. |
| `net.ipv4.ip_local_port_range` | 폭 `20000` 이상 | outbound test, proxy, relay 보조 연결의 ephemeral port 부족을 줄인다. |

## 적용 예시
서버 메모리와 동시 접속 목표를 확인한 뒤 `/etc/sysctl.d/99-gcs-saker-webrtc.conf`에 저장한다.

```conf
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.netfilter.nf_conntrack_max = 262144
net.ipv4.ip_local_port_range = 20000 60999
```

적용:

```bash
sudo sysctl --system
scripts/ops/server_udp_tuning_check.sh
```

## 주의
- conntrack 값을 올리면 메모리 사용량도 증가한다.
- TURN relay port range는 방화벽/NAT 포워딩 범위와 반드시 일치해야 한다.
- STUN/direct가 정상이어도 CGNAT/symmetric NAT 단말은 TURN fallback이 필요하다.
