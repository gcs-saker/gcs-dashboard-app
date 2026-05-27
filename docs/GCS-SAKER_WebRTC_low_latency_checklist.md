# GCS-SAKER WebRTC 저지연 운영 체크리스트

## 기본 경로
- 시청은 WebRTC WHEP를 우선 사용한다.
- HLS는 WebRTC 실패 시 fallback으로만 사용한다.
- 송출은 WHIP `POST application/sdp`로 시작한다.

## 네트워크 조건
- Public entrypoint HTTPS: `443/tcp`
- WebRTC ICE media: `8189/udp`, `8189/tcp`
- STUN: `stun:stun.l.google.com:19302`
- `443`만 열려 있으면 signaling은 되지만, ICE media가 붙지 않아 `deadline exceeded while waiting connection`이 날 수 있다.

## 장애 단서
- `POST /webrtc/.../whip -> 201`: WHIP signaling 성공
- MediaMTX `deadline exceeded while waiting connection`: ICE media 포트 또는 NAT 경로 문제
- WHEP `404 no stream is available`: publisher가 없거나 ICE 실패로 publisher session이 닫힌 상태
