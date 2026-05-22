# M1-15 Streaming E2E Smoke Test

## 목적

M1-15는 Streaming Core의 최소 실행 흐름을 한 번에 확인하기 위한 smoke test 절차다. 기준 stream은 `raw/sample/front`이고 backend streamId는 `raw.sample.front`다.

## 자동 검증

CI나 로컬에서 부담 없이 실행할 수 있는 정적 smoke check:

```bash
scripts/streaming_e2e_smoke.sh --check
```

이 모드는 다음을 확인한다.

- sample publish script의 bash syntax
- E2E smoke script의 bash syntax
- `raw/sample/front` dry-run publish command
- WebRTC/HLS/STUN 확인 절차 문서 존재

## 실제 E2E 실행

실제 MediaMTX와 ffmpeg publish까지 수행하려면 `ffmpeg`, Docker, npm, backend Python venv가 필요하다.

```bash
scripts/streaming_e2e_smoke.sh --run
```

실행 흐름:

1. `docker compose up -d mediamtx`
2. FastAPI backend 실행
3. `scripts/publish_sample_stream.sh`로 `raw/sample/front` publish
4. backend playback API 확인
5. HLS fallback playlist 확인
6. dashboard smoke URL 확인

기본 dashboard smoke URL:

```text
http://127.0.0.1:18023/?streamingSmoke=1
```

## Playback API 통과 기준

다음 API가 WebRTC primary와 HLS fallback URL을 함께 반환해야 한다.

```bash
curl http://127.0.0.1:18024/api/v1/streams/raw.sample.front/playback
```

기대 URL 형태:

```json
{
  "streamId": "raw.sample.front",
  "status": "online",
  "playbackUrls": {
    "webrtc": "http://127.0.0.1:8889/raw/sample/front/whep",
    "hls": "http://127.0.0.1:8888/raw/sample/front/index.m3u8"
  }
}
```

## Dashboard WebRTC 확인

브라우저에서 다음 URL을 연다.

```text
http://127.0.0.1:18023/?streamingSmoke=1
```

확인 항목:

- `raw.sample.front`가 표시된다.
- playback API 호출 후 mode가 `webrtc`로 진입한다.
- WebRTC 연결이 성공하면 player 상태가 `playing`으로 바뀐다.
- WebRTC 연결이 실패하면 HLS fallback 영역으로 전환된다.

## HLS fallback 확인

HLS playlist는 다음 URL로 확인한다.

```bash
curl http://127.0.0.1:8888/raw/sample/front/index.m3u8
```

정상이라면 `#EXTM3U`로 시작하는 playlist가 반환된다.

## STUN/ICE 체크리스트

localhost/LAN 환경에서는 기본 ICE 서버 없이도 재생될 수 있다. 외부망이나 NAT 환경에서 WebRTC가 실패하면 다음을 확인한다.

- `docs/m1/mediamtx-ice-servers.md`의 STUN/TURN 설정을 적용했는가?
- `MEDIAMTX_STUN_URL`이 `.env` 또는 배포 설정으로 주입되었는가?
- `8189/udp`, `8189/tcp`, `8889/tcp`가 방화벽에서 열려 있는가?
- TURN credential을 저장소에 커밋하지 않았는가?

## 실패 시 분리 기준

- sample stream publish 실패: `ffmpeg` 설치, RTSP port `8554`, MediaMTX container 로그 확인
- playback API 실패: backend env `MEDIAMTX_PUBLIC_WEBRTC_BASE_URL`, `MEDIAMTX_PUBLIC_HLS_BASE_URL` 확인
- HLS playlist 실패: stream path가 `raw/sample/front`인지, MediaMTX가 publisher를 인식했는지 확인
- WebRTC 실패: 브라우저 console, ICE candidate, STUN/TURN 설정 확인 후 HLS fallback으로 전환되는지 확인
