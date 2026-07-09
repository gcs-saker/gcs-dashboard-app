# GCS-Saker M7 public ICE candidate 운영가이드

## 목적
외부 NAT 환경에서 WebRTC가 TURN relay를 먼저 쓰지 않도록 MediaMTX가 공개 후보를 광고하게 만든다. direct STUN 경로가 성립하면 TURN 서버는 인증과 fallback만 담당하므로 relay 포트, CPU, 네트워크 사용량이 줄어든다.

## 적용 값
비밀값은 저장소에 두지 않는다. 운영 서버의 `.env.single-node`에는 다음 공개 후보 설정만 반영한다.

```dotenv
MEDIAMTX_ICE_BIND_ADDR=0.0.0.0
MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES=false
MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS=a4ai.tplinkdns.com
MEDIA_CONTROL_STUN_URL=stun:a4ai.tplinkdns.com:3478
MEDIA_CONTROL_TURN_MAX_HEALTHY_SERVERS=1
```

## 동작 순서
1. 브라우저 또는 송출 단말이 `/media-control/api/v1/streams/ice-servers`를 조회한다.
2. media-control은 STUN을 먼저, TURN은 최대 1개 fallback으로 내려준다.
3. 브라우저는 STUN으로 server-reflexive candidate를 만든다.
4. WHEP/WHIP offer가 MediaMTX에 전달된다.
5. MediaMTX는 `MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS`에 들어간 공개 DNS candidate를 answer SDP에 담는다.
6. ICE가 direct candidate로 completed 되면 TURN relay를 쓰지 않는다.
7. direct candidate가 실패하면 TURN relay로 fallback 한다.

## 확인 명령
운영 서버 내부:

```bash
sudo docker compose -f /opt/gcs-saker/current/deploy/compose/docker-compose.single-node.yml config --quiet
sudo docker compose -f /opt/gcs-saker/current/deploy/compose/docker-compose.single-node.yml ps mediamtx media-control turn-primary turn-secondary
```

외부 NAT 단말:

```bash
scripts/smoke/m7_external_nat_webrtc_smoke.sh --ice-profile stun-direct --stream-id raw.local.webcam
scripts/smoke/m7_external_nat_webrtc_smoke.sh --ice-profile turn-relay --stream-id raw.local.webcam
```

## 완료 기준
- WHEP answer SDP에 사설 Docker IP만 남지 않는다.
- direct smoke에서 `relay=0`, `ICE connection state=completed`, first video frame이 확인된다.
- turn relay smoke도 별도 통과해서 CGNAT/symmetric NAT fallback이 보장된다.
