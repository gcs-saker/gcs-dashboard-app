# M7 Dashboard Runtime Optimization Notes

## 적용 범위

- 운영 이벤트 로그는 `/ops/events/page` keyset page API를 우선 사용한다.
- 프론트는 최근 page를 받아 중복 제거 후 최대 500건까지 메모리 누적한다.
- 서버 상태 RTT는 탭 전환 중에도 마지막 snapshot과 최근 history를 유지한다.
- WebRTC 수신 지표는 영상/음성 상태뿐 아니라 ICE 경로 지표까지 dashboard snapshot으로 올린다.
- Talkback 송신은 로컬 마이크 트랙과 입력 레벨을 UI에서 확인할 수 있어야 한다.

## 효과

- 이벤트 화면 polling 때 전체 이벤트 배열을 반복 전송하지 않아 API payload와 렌더링 부담이 줄어든다.
- 운영자는 탭 전환 후에도 마지막 상태와 최근 RTT 흐름을 잃지 않는다.
- `relay` 후보 선택 여부를 UI에서 볼 수 있어 TURN 부하 원인을 더 빨리 판단할 수 있다.
- 마이크 송신 문제를 WHIP 실패와 로컬 입력 부재로 나누어 확인할 수 있다.

## Redis 적용 기준

- 허용: operational event fresh/stale cache, stream registry 최신 read model, server status 최신 snapshot.
- 주의: Redis 장애 시 stale 또는 backing repository fallback이 있어야 한다.
- 금지: 인증/인가의 최종 판단을 Redis cache 단독 결과에 의존하지 않는다.
- 금지: refresh token consume처럼 원자성이 필요한 경로를 단순 get/set cache로 대체하지 않는다.

## SSE/WebSocket 전환 기준

- 이벤트 로그 polling 주기가 3초 이하로 내려가거나 접속 운영자가 늘면 SSE/WebSocket을 검토한다.
- 실시간성이 필요한 알림은 push channel로 보내고, 장기 조회는 page API로 유지한다.
- 재연결 시에는 마지막 event id 또는 timestamp 이후 delta만 요청한다.

## Stream Session Metric 기준

- 최소 지표: stream id, selected ICE local/remote candidate type, transport protocol, ICE RTT, WHEP response time.
- TURN 부담 지표: relay session count, relay fallback reason, relay RTT, packet loss.
- UI 노출: 운영 요약에는 ICE 경로, 음성 패널에는 ICE 경로와 ICE RTT만 간단히 표시한다.

## 검증 기준

- dashboard unit/integration test가 통과해야 한다.
- frontend build가 통과해야 한다.
- browser preview에서 이벤트 그래프와 RTT 차트가 패널 밖으로 넘치지 않아야 한다.
