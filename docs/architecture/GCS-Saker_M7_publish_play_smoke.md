# GCS-Saker M7 WebRTC publish/play smoke

## 목적
이 문서는 #210의 검증 기준이다. #208은 runtime service가 함께 뜨는지를 확인했다. #210은 실제 sample stream이 MediaMTX에 publish되고, edge를 통해 playback 경로가 열리는지 확인한다.

## 검증 범위
- Docker ffmpeg publisher가 `rtsp://mediamtx:8554/raw/sample/front`로 sample stream을 publish한다.
- MediaMTX API에서 path가 `ready=true`로 나타나는지 확인한다.
- edge의 HLS master/variant playlist가 200 OK로 열리는지 확인한다.
- 선택적으로 aiortc 기반 WHEP offer/answer와 첫 video frame 수신 smoke를 실행한다.
- publish 시작 이후 MediaMTX ready, HLS master, HLS variant까지 걸린 시간을 ms 단위로 기록한다.

## 실행
```bash
scripts/smoke/m7_publish_play_smoke.sh --check
```

실제 Docker runtime:

```bash
scripts/smoke/m7_publish_play_smoke.sh --run
```

WebRTC WHEP smoke를 제외하고 HLS/MediaMTX만 빠르게 볼 때:

```bash
RUN_WEBRTC_ICE_SMOKE=0 scripts/smoke/m7_publish_play_smoke.sh --run
```

## 왜 Docker ffmpeg인가
현재 개발 Mac에 `ffmpeg`가 없을 수 있다. 폐쇄망 납품 기준에서도 host package 설치에 의존하면 재현성이 떨어진다. 따라서 publisher 자체도 Docker image로 고정하고, 폐쇄망에서는 해당 image를 tar로 반입하는 방향을 기본으로 둔다.

## 확인해야 하는 수치
- MediaMTX ready latency ms
- HLS master latency ms
- HLS variant latency ms
- WHEP offer/answer 성공 여부
- WebRTC 첫 video frame latency ms

이 값은 실제 현장 네트워크 지연이 아니라 local single-node PoC 기준이다. 공개망/폐쇄망 서버에서는 같은 스크립트를 서버별 포트와 도메인으로 실행해 비교해야 한다.

## 남은 한계
- HLS latency는 첫 manifest 도달 시간이며 WebRTC 첫 프레임 지연과 같지 않다.
- 이 smoke의 첫 video frame latency는 aiortc 수신 기준이다. Dashboard player의 실제 렌더링 시간은 browser automation 이슈에서 별도로 측정해야 한다.
- `jrottenberg/ffmpeg:6.1-alpine`은 현재 Mac에서 amd64 image로 동작한다. 성능 비교 수치에는 emulation overhead가 섞일 수 있으므로 서버 검증에서는 native image 또는 서버 host ffmpeg도 비교해야 한다.
