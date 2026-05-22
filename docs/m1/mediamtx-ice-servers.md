# MediaMTX WebRTC ICE 서버 설정

## 왜 변경했는가

M1의 완료 기준은 WebRTC 기반 스트리밍이 실제 연결 가능한 기본 구조를 갖추는 것이다. WebRTC handshake는 HTTP로 진행되지만, 미디어는 ICE peer connection으로 흐른다. 서버와 브라우저 사이에 NAT, 컨테이너 네트워크, 방화벽, LTE/5G망, 기관망이 있으면 static ICE 포트만으로 연결이 실패할 수 있다.

MediaMTX 공식 문서는 이 경우 `webrtcICEServers2`에 STUN 서버를 넣어 공개 후보를 수집하고 UDP hole punching을 시도하도록 안내한다. 그래도 실패하는 환경에서는 TURN 서버를 사용해 relay 후보를 제공한다.

## STUN과 보안의 역할 구분

STUN은 암호화를 담당하지 않는다. STUN은 NAT traversal을 위해 서버와 클라이언트가 외부에서 보이는 주소 후보를 찾도록 돕는 역할이다.

WebRTC 미디어 보호는 WebRTC 자체의 DTLS/SRTP가 담당한다. 따라서 STUN은 연결 성립성을 높이는 네트워크 구성 요소이고, 암호화 계층과는 역할이 다르다.

## 기본 정책

- 로컬 개발과 같은 단순 LAN 환경은 기본 `mediamtx.yml`만으로 실행 가능해야 한다.
- 외부망, NAT, LTE/5G, 기관망 검증에서는 `docker-compose.ice.example.yml`을 함께 사용한다.
- STUN URL과 TURN credential은 `.env` 또는 배포 secret으로 주입한다.
- 실제 TURN credential은 저장소에 커밋하지 않는다.
- MediaMTX API와 metrics 포트는 ICE 서버 설정과 무관하게 외부에 노출하지 않는다.

## 사용 방법

1. `gcs-dashboard/.env.example`을 참고해 로컬 `.env`에 ICE 값을 넣는다.

```env
MEDIAMTX_STUN_URL=stun:stun.example.org:3478
```

2. ICE override compose를 함께 실행한다.

```bash
docker compose -f docker-compose.yml -f docker-compose.ice.example.yml up
```

3. TURN relay가 필요한 환경에서는 `.env`에 TURN 값을 추가하고, `docker-compose.ice.example.yml`의 TURN 예시 줄을 활성화한다.

```env
MEDIAMTX_TURN_URL=turn:turn.example.org:3478?transport=tcp
MEDIAMTX_TURN_USERNAME=AUTH_SECRET
MEDIAMTX_TURN_PASSWORD=replace-with-secret-outside-git
MEDIAMTX_TURN_CLIENT_ONLY=false
```

## M1에서 확인할 것

- `webrtcICEServers2` 설정 지점이 존재한다.
- STUN 서버 URL은 코드에 고정하지 않고 환경변수로 주입할 수 있다.
- TURN credential은 저장소에 들어가지 않는다.
- HLS fallback, WebRTC static UDP/TCP 포트, API/metrics 비공개 정책은 유지된다.
