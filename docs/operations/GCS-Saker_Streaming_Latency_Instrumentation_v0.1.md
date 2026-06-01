# GCS-Saker Streaming Latency Instrumentation v0.1

## 목적

저지연 스트리밍 최적화는 추측으로 하면 안 된다. WebRTC 연결 과정에서 어느 단계가 느린지 알 수 있도록 dashboard client가 단계별 signaling 시간을 기록한다.

## 측정 지점

`WebRTCPlayer`는 다음 값을 snapshot과 DOM data attribute로 노출한다.

- `iceServersLoadedMs`: ICE server contract 조회 완료까지 걸린 시간
- `offerCreatedMs`: local SDP offer 생성 완료 시간
- `localDescriptionSetMs`: local description 설정 완료 시간
- `iceGatheringDoneMs`: ICE gathering 완료 또는 bounded wait 종료 시간
- `whepResponseMs`: WHEP POST 응답 수신 시간
- `remoteDescriptionSetMs`: remote SDP answer 설정 완료 시간
- `firstFrameLatencyMs`: video `loadeddata` 기준 첫 프레임 표시 시간

## 확인 방법

브라우저 테스트 또는 운영 smoke에서 다음 attribute를 확인한다.

```text
data-whep-response-ms
data-ice-gathering-done-ms
data-first-frame-latency-ms
```

## 해석 기준

- `iceServersLoadedMs`가 높으면 backend ICE API, auth refresh, edge routing을 확인한다.
- `iceGatheringDoneMs`가 높으면 STUN/TURN 응답성, NAT, relay candidate 수집을 확인한다.
- `whepResponseMs`가 높으면 MediaMTX WHEP endpoint, Nginx proxy, TLS, network RTT를 확인한다.
- `firstFrameLatencyMs`가 높으면 media track arrival, browser decode, player layout/rendering을 확인한다.

## 다음 자동화 대상

- publish-to-play end-to-end latency script
- WHIP publisher signaling timing
- HLS fallback 첫 segment 수신 시간
- 실제 NAT 외부 단말에서 TURN relay 사용 여부와 latency 비교
