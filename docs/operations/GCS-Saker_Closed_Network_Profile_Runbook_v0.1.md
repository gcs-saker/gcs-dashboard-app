# GCS-Saker Closed-Network Profile Runbook v0.1

## 목적

GCS-Saker는 공개망과 폐쇄망 모두에서 동작해야 한다. 폐쇄망에서는 외부 DNS, Google STUN, 공개 지도 tile, npm registry 접속을 운영 중에 요구하지 않아야 한다.

## 이번 기준선

- 폐쇄망 프로필 STUN 값은 내부 STUN/TURN VIP 예시인 `stun:10.0.0.10:3478`이다.
- 폐쇄망 profile은 `gcs-dashboard/.env.closed-network.example`에 분리한다.
- 실제 납품 환경에서는 `10.0.0.10` 예시값을 appliance VIP 또는 내부 TURN/STUN 서버 IP로 교체한다.
- 지도는 `TacticalLeafletMap`의 offline renderer를 사용하며 공개 tile provider를 호출하지 않는다.
- dashboard container는 build 단계에서 `npm run build`를 끝내고, runtime은 nginx가 `dist`만 서빙한다.

## 정적 검증

인터넷을 끊은 상태에서도 아래 검사는 실행되어야 한다.

```bash
python3 scripts/closed_network_static_check.py
```

확인 항목:

- active config에 `stun:stun.l.google.com:19302` 기본값이 남아있지 않은지
- closed-network env profile에 STUN/TURN/time server 값이 있는지
- offline map renderer가 public tile provider 문자열을 포함하지 않는지
- dashboard Dockerfile이 runtime npm install 없이 nginx로 build artifact를 서빙하는지

## 로컬 폐쇄망 모의 절차

1. private `.env`에 `gcs-dashboard/.env.closed-network.example` 값을 복사한다.
2. `WEBRTC_TURN_PASSWORD`, `MYSQL_PASSWORD`, `AUTH_JWT_SECRET`를 실제 secret으로 바꾼다.
3. TURN/STUN host를 같은 LAN에서 접근 가능한 IP 또는 VIP로 바꾼다.
4. 외부 인터넷을 끊거나 firewall에서 외부 DNS/HTTP를 막는다.
5. `python3 scripts/closed_network_static_check.py`를 실행한다.
6. Docker image가 이미 준비된 상태에서 compose를 실행한다.
7. dashboard에서 시간 동기화 모드를 `폐쇄망`으로 설정하고 내부 time server를 점검한다.
8. 송출 단말이 `/webrtc/raw/local/webcam/whip`으로 송출하고 dashboard에서 WHEP playback을 확인한다.

## 아직 실제 장비에서 확인해야 할 것

- 내부 TURN relay allocation 성공 여부
- 내부 NTP/chrony와 서버 clock drift
- 외부 DNS 차단 상태에서 dashboard 최초 로딩
- 오프라인 Docker image tarball load 절차
- 폐쇄망 tile package가 필요할 경우 MBTiles 또는 내부 tile server 선택
