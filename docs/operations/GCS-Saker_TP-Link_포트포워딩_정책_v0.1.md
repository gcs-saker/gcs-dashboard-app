# GCS-Saker TP-Link 포트포워딩 정책 v0.1

작성일: 2026-05-26 KST
갱신일: 2026-05-27 KST

## 목표

M2 후반 Server-02 staging 및 Server-01 production 후보 배포 전에 TP-Link/NAT, 서버 방화벽, Docker publish 포트의 역할을 분리한다. 이 문서는 실제 공유기 설정값이나 내부 IP를 기록하지 않고, 공개 가능한 포트 정책과 점검 절차만 정의한다.

## 기본 원칙

- 외부 사용자는 가능하면 `443/tcp` 하나로 dashboard, backend API, WSS, HLS, WebRTC WHEP signaling에 접근한다.
- Server-01 production 후보의 Docker 직접 서비스 포트는 기본 `127.0.0.1` 바인딩으로 유지하고, 외부 공개는 `edge` Nginx의 `443/tcp`만 사용한다.
- WebRTC ICE media candidate 포트는 HTTP reverse proxy 대상이 아니므로 별도 포트포워딩 또는 TURN relay가 필요하다.
- HLS와 WebRTC WHEP signaling은 Nginx reverse proxy를 우선 경로로 둔다.
- STUN/TURN 서버와 credential은 Nginx가 proxy하지 않는다.
- MediaMTX API `9997`과 metrics `9998`은 외부에 포트포워딩하지 않는다.
- Server-01 host와 UFW는 `443/tcp` edge 인입을 받을 준비가 끝났고, 실제 외부 도달은 TP-Link `443/tcp -> Server-01` 포트포워딩 적용 후 확인한다.

## 포트 정책

| 포트 | 프로토콜 | 기본 정책 | 대상 | 이유 |
| --- | --- | --- | --- | --- |
| `443` | `tcp` | 외부 공개 | Nginx reverse proxy | dashboard, API, WSS, HLS, WebRTC WHEP signaling의 단일 public entrypoint |
| `80` | `tcp` | 조건부 공개 | Nginx reverse proxy | HTTPS redirect 또는 ACME HTTP-01 challenge가 필요할 때만 사용 |
| `8889` | `tcp` | 직접 공개 금지 | MediaMTX WebRTC/WHEP | 기본 경로는 `443/tcp`의 `/webrtc/` proxy이며, 직접 공개는 staging 진단 시에만 임시 허용 |
| `8189` | `udp` | 조건부 공개 | MediaMTX WebRTC ICE | 브라우저가 MediaMTX와 직접 ICE media path를 만들 때 필요 |
| `8189` | `tcp` | 조건부 공개 | MediaMTX WebRTC ICE TCP fallback | UDP ICE 실패 환경의 fallback 경로 |
| `8888` | `tcp` | 직접 공개 금지 | MediaMTX HLS | 기본 경로는 `443/tcp`의 `/hls/` proxy |
| `8554` | `tcp` | 외부 공개 금지 | MediaMTX RTSP ingest | 현장 장비 ingest는 VPN, 내부망, 또는 staging 임시 허용으로 분리 |
| `8890` | `udp` | 조건부 공개 | MediaMTX SRT ingest | 실제 현장 송출 장비 검증 시에만 source 제한과 함께 허용 |
| `1935` | `tcp` | 외부 공개 금지 | MediaMTX RTMP ingest | legacy fallback이며 기본 공개 대상이 아님 |
| `3478` | `udp/tcp` | M5로 이관 | coturn STUN/TURN | TURN relay 구성 이슈에서 credential, realm, relay range와 함께 결정 |
| `5349` | `tcp` | M5로 이관 | coturn TURNS | TURN over TLS 구성 이슈에서 결정 |
| `9997` | `tcp` | 외부 공개 금지 | MediaMTX API | 내부 관리 포트 |
| `9998` | `tcp` | 외부 공개 금지 | MediaMTX metrics | 내부 관측 포트 |

## WebRTC/HLS/STUN/TURN 판단

### WebRTC

- WHEP signaling은 `https://<host>/webrtc/<stream>/whep` 형태로 Nginx를 거친다.
- ICE media path는 `8189/udp`를 우선 사용하고, 제한 네트워크에서는 `8189/tcp` fallback 또는 M5 TURN relay로 전환한다.
- Server-02 staging에서는 ICE direct path를 확인하기 위해 `8189/udp`, `8189/tcp`를 조건부로 열 수 있다.

### HLS

- HLS playback은 `https://<host>/hls/<stream>/index.m3u8` 형태로 Nginx를 거친다.
- `8888/tcp` 직접 포트포워딩은 하지 않는다.

### STUN/TURN

- STUN은 NAT 후보 수집을 돕지만 암호화를 담당하지 않는다.
- TURN은 relay와 credential 관리가 필요하므로 M5 coturn 구성에서 다룬다.
- TURN relay port range는 M5에서 부하 테스트와 함께 확정한다.

## 배포 전 점검 체크리스트

- [ ] TP-Link에는 `443/tcp`만 필수 public entrypoint로 등록한다.
- [ ] `3000/tcp`, `8001/tcp`, `8888/tcp`, `8889/tcp`는 TP-Link 포트포워딩에 등록하지 않는다.
- [ ] `80/tcp`는 HTTPS redirect 또는 ACME challenge가 필요할 때만 임시 또는 제한적으로 등록한다.
- [ ] `8889/tcp`, `8888/tcp`는 직접 공개하지 않고 Nginx reverse proxy 경유를 확인한다.
- [ ] WebRTC 직접 ICE 검증이 필요하면 `8189/udp`, `8189/tcp`만 조건부로 등록하고 테스트 후 정책을 재검토한다.
- [ ] SRT 장비 검증이 필요할 때만 `8890/udp`를 source 제한과 함께 등록한다.
- [ ] `8554/tcp`, `1935/tcp`, `9997/tcp`, `9998/tcp`는 외부 포트포워딩에 등록하지 않는다.
- [ ] 서버 UFW 정책이 TP-Link 공개 정책보다 넓지 않은지 확인한다.
- [ ] Docker publish 포트 중 관리 포트 `9997`, `9998`이 없는지 확인한다.
- [ ] 외부 네트워크에서 `https://<host>/`, `/api/`, `/hls/`, `/webrtc/` 경로를 점검한다.
- [ ] 실패 시 되돌릴 TP-Link rule snapshot과 compose/env snapshot을 남긴다.

## Server-01 현재 확인 상태

- Server-01 Docker publish는 `edge` Nginx의 `443/tcp`만 외부 인터페이스에 바인딩한다.
- Server-01 UFW는 `55121/tcp` SSH와 `443/tcp` HTTPS edge만 허용한다.
- `3000/tcp`, `8001/tcp`, `8888/tcp`, `8889/tcp`, `8189/tcp`, `8189/udp`는 host `127.0.0.1`에 바인딩되어 직접 외부 공개하지 않는다.
- 외부 `https://a4ai.tplinkdns.com/` 요청은 아직 연결 실패이며, 남은 조치점은 TP-Link 포트포워딩이다.

## M2 적용 순서

1. Server-02 staging에서 compose/env/Nginx 설정을 먼저 배치한다.
2. TP-Link에는 `443/tcp`를 우선 등록한다.
3. WebRTC WHEP signaling이 `443/tcp` 경유로 응답하는지 확인한다.
4. ICE 후보 실패가 확인될 때만 `8189/udp`, `8189/tcp`를 조건부로 열고 재검증한다.
5. 현장 장비 ingest 테스트가 필요한 경우 `8890/udp`를 제한적으로 연다.
6. Server-01 production 후보에는 Server-02 결과를 반영해 최소 포트만 적용한다.
