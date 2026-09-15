# GCS-Saker M7 WebRTC publish/play smoke

## 목적

이 문서는 인증된 계정 송출 세션에서 실제 재생까지 이어지는 단일 노드 미디어 경계를 검증한다. 클라이언트가 MediaMTX 경로를 선택하지 않고, `media-control`이 발급한 opaque stream ID와 단기 토큰만 사용해야 한다.

## 검증 범위

1. operator 계정으로 로그인해 access token을 받는다.
2. `POST /media-control/api/v1/account/publish-sessions`에 sensor ID를 제출한다.
3. 응답의 서버 발급 `publishUrl`과 `publishToken`으로 합성 Opus 음성 및 영상을 WHIP 송출한다.
4. 서버 발급 stream ID로 playback API를 호출한다.
5. 응답의 HLS master 및 첫 variant playlist가 열리는지 확인한다.
6. 응답의 WHEP URL에서 실제 audio frame과 video frame을 모두 수신한다.

토큰과 세션 응답은 권한이 제한된 임시 디렉터리에만 저장하며, 로그에는 publish/playback URL이나 토큰을 출력하지 않는다. 종료 시 임시 파일과 publisher 컨테이너를 제거한다.

## 실행

계약 검사:

```bash
scripts/smoke/m7_publish_play_smoke.sh --check
```

실제 Docker runtime:

```bash
scripts/smoke/m7_publish_play_smoke.sh --run
```

WHEP 프레임 검사를 제외하고 세션 발급과 HLS만 확인할 때:

```bash
RUN_WEBRTC_ICE_SMOKE=0 scripts/smoke/m7_publish_play_smoke.sh --run
```

기본 송출 시간은 90초다. 느린 첫 이미지 다운로드 환경에서는 `PUBLISH_DURATION_SECONDS`를 늘릴 수 있다.

## 합격 기준

- health/readiness가 모두 성공한다.
- 계정 publish session이 발급되고 WHIP ICE가 연결된다.
- HLS master 및 적어도 하나의 variant가 200 응답을 반환한다.
- WHEP가 audio/video frame을 각각 하나 이상 수신한다.
- 정적 계약 검사에서 직접 RTSP publish 및 클라이언트 지정 `STREAM_PATH`가 발견되지 않는다.

## 해석과 한계

- 기록되는 visibility latency는 WHIP 연결 이후 재생 검증 완료까지의 로컬 단일 노드 관측값이다.
- WHEP 첫 프레임은 aiortc 수신 기준이며 브라우저 렌더링 시간은 dashboard E2E에서 별도로 측정한다.
- 물리 장비가 없는 실행은 장비 호환성 증거가 아니라 합성 미디어 경로 증거다.
- Docker 엔진 또는 WSL 연동이 없으면 live 항목은 `BLOCKED`이며 정적 검사 통과로 대체하지 않는다.
