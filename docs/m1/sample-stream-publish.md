# M1-14 Sample Stream Publish

## 목적

M1-14는 로컬 개발자가 같은 명령으로 `raw/sample/front` 샘플 스트림을 MediaMTX에 publish할 수 있게 만드는 작업이다. 이 스트림은 backend seed stream `raw.sample.front`와 연결되며, playback API는 WebRTC primary URL과 HLS fallback URL을 같은 path 기준으로 반환한다.

## 사전 조건

- Docker 또는 Docker Compose로 MediaMTX가 실행 가능해야 한다.
- `ffmpeg`가 설치되어 있어야 한다.
- 기본 RTSP ingest 포트는 `8554/tcp`다.

```bash
cd gcs-dashboard
docker compose up mediamtx
```

## 기본 실행

저장소 루트에서 다음 명령을 실행한다.

```bash
scripts/publish_sample_stream.sh
```

기본 publish 대상은 다음과 같다.

```text
rtsp://127.0.0.1:8554/raw/sample/front
```

backend streamId 기준으로는 다음 값과 일치한다.

```text
raw.sample.front
```

## 실행 전 명령 확인

실제 publish 없이 ffmpeg 명령만 확인하려면 `--dry-run`을 사용한다.

```bash
scripts/publish_sample_stream.sh --dry-run
```

## 로컬 영상 파일 사용

테스트 패턴 대신 로컬 파일을 반복 publish할 수 있다.

```bash
scripts/publish_sample_stream.sh --file ./sample.mp4
```

짧은 smoke test에서는 duration을 줄 수 있다.

```bash
scripts/publish_sample_stream.sh --duration 10
```

## 포트와 경로 변경

MediaMTX RTSP 포트만 바꾸려면 `MEDIAMTX_RTSP_PORT`를 사용한다.

```bash
MEDIAMTX_RTSP_PORT=18554 scripts/publish_sample_stream.sh
```

전체 RTSP URL을 직접 지정할 수도 있다.

```bash
scripts/publish_sample_stream.sh --url rtsp://127.0.0.1:8554/raw/sample/front
```

## 확인 절차

1. MediaMTX 로그에서 `raw/sample/front` publisher가 연결됐는지 확인한다.
2. backend playback API가 아래 형태의 URL을 반환하는지 확인한다.

```bash
curl http://127.0.0.1:8001/api/v1/streams/raw.sample.front/playback
```

3. HLS fallback은 다음 URL 형태로 확인한다.

```text
http://127.0.0.1:8888/raw/sample/front/index.m3u8
```

4. WebRTC/WHEP primary는 다음 URL 형태로 확인한다.

```text
http://127.0.0.1:8889/raw/sample/front/whep
```

## 실패 시 확인할 것

- `ffmpeg: command not found`: `ffmpeg`를 설치한다.
- `Connection refused`: `docker compose up mediamtx`가 실행 중인지 확인한다.
- `404` 또는 stream not found: publish path가 `raw/sample/front`인지 확인한다.
- HLS가 늦게 뜨는 경우: MediaMTX가 HLS segment를 만들 때까지 몇 초 기다린다.
- 외부망 WebRTC 연결 실패: STUN 설정은 `docs/m1/mediamtx-ice-servers.md` 기준으로 확인한다.
