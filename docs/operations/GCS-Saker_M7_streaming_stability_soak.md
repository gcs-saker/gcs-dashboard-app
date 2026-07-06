# GCS-Saker M7 Streaming Stability Soak

## 목적

#219는 실제 WebRTC stream을 일정 시간 유지하면서 연결 안정성, 재연결, fallback, 서버 리소스 상태를 한 보고서에 남기는 게이트다. 단발성 WHIP/WHEP smoke가 "연결 가능"을 확인한다면, soak는 "유지 가능"을 확인한다.

## 기준

- 30분/1시간 soak 기준:
  - 30분: `SOAK_DURATION_SECONDS=1800`
  - 1시간: `SOAK_DURATION_SECONDS=3600`
- 기본 샘플 간격: `SOAK_SAMPLE_INTERVAL_SECONDS=60`
- publisher는 하나의 WHIP 세션을 duration 동안 유지한다.
- receiver는 interval마다 WHEP first-frame probe를 수행한다.
- 실패 샘플은 disconnect/fallback event로 기록한다.
- 실패 뒤 다음 샘플 성공은 reconnect success로 기록한다.

## 실행

```bash
WEBRTC_TURN_USERNAME=... \
WEBRTC_TURN_PASSWORD=... \
RELAY_ONLY=1 \
SOAK_DURATION_SECONDS=1800 \
SOAK_SAMPLE_INTERVAL_SECONDS=60 \
REPORT_FILE=/tmp/gcs-saker-m7-soak-report.txt \
scripts/smoke/m7_streaming_stability_soak.sh --run
```

서버 리소스까지 함께 기록하려면 SSH key 기반 접속을 준비한 뒤 다음 값을 추가한다.

```bash
SERVER_SSH_TARGET=user@a4ai.tplinkdns.com \
SERVER_SSH_PORT=55121 \
SERVER_DOCKER_COMMAND="sudo docker" \
scripts/smoke/m7_streaming_stability_soak.sh --run
```

## 기록 항목

- edge readiness: `/healthz`, `/readyz`, `/media-control/readyz`
- TURN primary/secondary allocation latency
- WHEP ICE connection state
- first video frame latency
- candidate summary: host/srflx/relay, private/public 후보 수
- disconnect events
- reconnect successes
- fallback events
- Docker CPU/memory/network snapshot
- MediaMTX/TURN/edge/backend/media-control container status

## 해석

| 지표 | 의미 | 확인 방향 |
| --- | --- | --- |
| first video frame latency | publish 유지 중 receiver가 첫 프레임을 받는 시간 | ICE path, codec, 서버 부하 |
| disconnect events | 샘플 중 WHEP 실패 횟수 | MediaMTX 로그, TURN allocation, 네트워크 |
| reconnect successes | 실패 뒤 다음 샘플이 복구된 횟수 | 자동 복구성 |
| fallback events | WebRTC 실패로 fallback이 필요했던 횟수 | HLS fallback, UX 메시지 |
| Docker stats | 서버 리소스 사용량 | CPU saturation, memory leak, network IO |

## 제한

이 스크립트는 한 publisher를 유지하고 여러 receiver probe를 반복한다. 실제 다중 사용자 부하, 5/10/16 stream 동시 부하는 M5 부하 테스트에서 별도 실행한다.
