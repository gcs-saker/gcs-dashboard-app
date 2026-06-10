# GCS-Saker M7 performance benchmark matrix

## 목적
#217은 old legacy, release v0.2.0, M7 언어 변경 완성본을 같은 기준으로 비교하기 위한 gate다. 비교 대상이 달라도 같은 profile schema, 같은 반복 횟수, 같은 stream id, 같은 metric 이름을 사용해야 한다.

## 측정 대상
- `legacy`: Python 중심 legacy runtime이 남아 있는 기준선
- `v0.2.0`: release 0.2.0으로 고정한 운영 기준선
- `m7`: Spring/Kotlin auth-policy, Go media-control, MediaMTX/coturn 중심 M7 runtime

## 공통 지표
`scripts/m7_performance_benchmark_matrix.py --check`가 다음 metric 계약을 고정한다.

| metric | 의미 | 병목 판단 |
| --- | --- | --- |
| `auth_login` | 로그인 API p50/p95 | DB password hash, auth-policy latency, Redis/session path |
| `auth_refresh` | refresh API p50/p95 | refresh token store, cookie/session policy |
| `stream_list` | stream registry 조회 p50/p95 | media-control cache, MediaMTX API polling, 권한 필터 |
| `stream_playback` | playback URL 계약 p50/p95 | stream id parsing, URL builder, 권한 결정 |
| `stream_ice_servers` | ICE 서버 목록 p50/p95 | Redis ICE server cache, auth gate, TURN config lookup |
| `hls_manifest` | HLS manifest 최초 응답 p50/p95 | MediaMTX path readiness, edge proxy, HLS fallback |

WebRTC media 계측은 같은 report에 별도 smoke 수치로 함께 기록한다.

- `whep_answer_latency_ms`
- `first_video_frame_latency_ms`
- `hls_master_latency_ms`
- `hls_variant_latency_ms`

## profile 파일 예시
비밀번호는 파일에 직접 넣지 않고 환경 변수로 주입한다.

```json
{
  "profiles": [
    {
      "label": "m7",
      "edgeBaseUrl": "http://127.0.0.1:18080",
      "authBasePath": "/auth-policy/auth",
      "streamBasePath": "/media-control/api/v1",
      "username": "m7-smoke-viewer",
      "passwordEnv": "M7_BENCHMARK_PASSWORD",
      "streamId": "raw.sample.front"
    }
  ]
}
```

## 실행 순서
1. single-node 또는 서버 runtime을 띄운다.
2. sample stream을 먼저 publish한다.
3. `scripts/m7_publish_play_smoke.sh --run`으로 MediaMTX/HLS/WHEP 경로를 확인한다.
4. benchmark profile 파일을 준비한다.
5. 다음 명령으로 API/HLS 반복 지연을 측정한다.

```bash
M7_BENCHMARK_PASSWORD='smoke-password' \
scripts/m7_performance_benchmark_matrix.py \
  --profile-json /path/to/m7-benchmark-profiles.json \
  --iterations 30 \
  --warmup 5 \
  --output /path/to/m7-benchmark-result.json
```

## 결과 해석
- p50은 평소 사용감에 가깝다.
- p95는 사용자가 가끔 겪는 느림과 운영 tail latency를 보여준다.
- `stream_ice_servers`가 느리면 TURN/STUN 목록 조회 cache, auth decision, Redis path를 본다.
- `stream_list`가 느리면 MediaMTX API polling, stream cache TTL, 권한 필터를 본다.
- `hls_manifest`가 느리면 stream publish readiness, HLS segment generation, edge proxy timeout을 본다.
- WebRTC first frame은 API latency보다 ICE candidate 품질, TURN relay 여부, browser decoder 상태의 영향을 더 크게 받는다.

## 완료 기준
- legacy, v0.2.0, m7 중 실행 가능한 profile이 같은 script로 측정된다.
- 결과 JSON에 `schemaVersion: m7-performance-benchmark-v1`가 포함된다.
- API/HLS metric은 p50/p95/max/errors를 가진다.
- WebRTC media 수치는 `m7_publish_play_smoke.sh --run` 또는 browser first-frame smoke 결과와 함께 보고한다.
- Docker daemon, 포트, 권한 문제로 live run이 실패하면 실패 지점과 재실행 조건을 남긴다.
