# GCS-Saker M7 performance benchmark matrix

## 목적
#217은 old legacy, release v0.2.0, M7 언어 변경 완성본을 같은 기준으로 비교하기 위한 gate다. 비교 대상이 달라도 같은 profile schema, 같은 반복 횟수, 같은 stream id, 같은 metric 이름을 사용해야 한다.

## 측정 대상
- `legacy`: Python 중심 legacy runtime이 남아 있는 기준선
- `v0.2.0`: release 0.2.0으로 고정한 운영 기준선
- `m7`: Spring/Kotlin auth-policy, Go media-control, MediaMTX/coturn 중심 M7 runtime

## 공통 지표
`scripts/benchmarks/m7_performance_benchmark_matrix.py --check`가 다음 metric 계약을 고정한다.

| metric | 의미 | 병목 판단 |
| --- | --- | --- |
| `auth_login` | 로그인 API p50/p95 | DB password hash, auth-policy latency, Redis/session path |
| `auth_refresh` | refresh API p50/p95 | refresh token store, cookie/session policy |
| `ops_event_metrics` | 운영 이벤트 집계 API p50/p95 | DB aggregate query, Redis bypass, dashboard graph path |
| `ops_event_graphql_page` | 운영 이벤트 GraphQL page query p50/p95 | GraphQL resolver, keyset pagination, projection path |
| `stream_list` | stream registry 조회 p50/p95 | media-control cache, MediaMTX API polling, 권한 필터 |
| `stream_playback` | playback URL 계약 p50/p95 | stream id parsing, URL builder, 권한 결정 |
| `stream_ice_servers` | ICE 서버 목록 p50/p95 | Redis ICE server cache, auth gate, TURN config lookup |
| `hls_manifest` | HLS manifest 최초 응답 p50/p95 | MediaMTX path readiness, edge proxy, HLS fallback |

WebRTC media 계측은 같은 report에 별도 smoke 수치로 함께 기록한다.

- `whep_answer_latency_ms`
- `first_video_frame_latency_ms`
- `first_audio_frame_latency_ms`
- `audio_video_sync_offset_ms`
- `hls_master_latency_ms`
- `hls_variant_latency_ms`

ICE path 계측은 `scripts/smoke/webrtc_ice_smoke.py --run`의 selected pair 통계를 기준으로 기록한다.

| metric | 의미 | 병목 판단 |
| --- | --- | --- |
| `selected_local_candidate_type` | browser/local 쪽 selected ICE candidate type | `relay`면 TURN allocation과 relay 대역폭을 소비한다. |
| `selected_remote_candidate_type` | MediaMTX/remote 쪽 selected ICE candidate type | remote가 `relay`면 서버 public candidate, UDP, NAT mapping을 먼저 본다. |
| `selected_ice_protocol` | selected pair transport protocol | `tcp` fallback이면 UDP 차단 또는 방화벽 정책 가능성이 높다. |
| `ice_rtt_ms` | selected pair RTT | media first frame과 audio delay 원인 분리에 사용한다. |
| `direct_ratio` | 측정 session 중 host/srflx/prflx direct 비율 | 값이 높을수록 TURN 부하가 줄어든다. |
| `relay_ratio` | 측정 session 중 relay 비율 | TURN capacity, relay port range, credential quota 산정에 사용한다. |
| `relay_fallback_reason` | relay 선택 원인 분류 | 후보 미노출, UDP 차단, symmetric NAT, selected pair 미수집을 구분한다. |

ICE 경로는 최소 두 profile을 같은 stream id로 비교한다.

| profile | 의미 | 판단 기준 |
| --- | --- | --- |
| `stun-direct` | STUN 후보로 direct/srflx 경로가 성립하는지 확인 | TURN relay 없이 first frame이 뜨면 TURN 부하 절감 가능 |
| `turn-relay` | 강제 relay 또는 direct 실패 fallback 경로 확인 | CGNAT/symmetric NAT 상황에서도 연결 보장 |

## profile 파일 예시
비밀번호는 파일에 직접 넣지 않고 환경 변수로 주입한다.

```json
{
  "profiles": [
    {
      "label": "m7",
      "edgeBaseUrl": "http://127.0.0.1:18080",
      "authBasePath": "/auth-policy/auth",
      "opsBasePath": "/auth-policy/ops",
      "graphQlBasePath": "/auth-policy/graphql",
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
3. `scripts/smoke/m7_publish_play_smoke.sh --run`으로 MediaMTX/HLS/WHEP 경로를 확인한다.
4. benchmark profile 파일을 준비한다.
5. 다음 명령으로 API/HLS 반복 지연을 측정한다.

```bash
M7_BENCHMARK_PASSWORD='smoke-password' \
scripts/benchmarks/m7_performance_benchmark_matrix.py \
  --profile-json /path/to/m7-benchmark-profiles.json \
  --iterations 30 \
  --warmup 5 \
  --output /path/to/m7-benchmark-result.json
```

자체서명 인증서를 쓰는 staging 서버는 TLS 검증 실패가 benchmark 자체를 막을 수 있다. 이때만 다음처럼 의도를 명시하고 실행한다.

```bash
M7_BENCHMARK_PASSWORD='smoke-password' \
scripts/benchmarks/m7_performance_benchmark_matrix.py \
  --profile-json /path/to/m7-benchmark-profiles.json \
  --iterations 30 \
  --warmup 5 \
  --insecure
```

## 결과 해석
- p50은 평소 사용감에 가깝다.
- p95는 사용자가 가끔 겪는 느림과 운영 tail latency를 보여준다.
- `stream_ice_servers`가 느리면 TURN/STUN 목록 조회 cache, auth decision, Redis path를 본다.
- `ops_event_metrics`가 느리면 DB aggregate query와 인덱스 범위, Redis wrapper가 집계 경로를 가로막는지 본다.
- `ops_event_graphql_page`가 느리면 GraphQL resolver, keyset pagination, projection 필드 수, query security interceptor를 본다.
- `stream_list`가 느리면 MediaMTX API polling, stream cache TTL, 권한 필터를 본다.
- `hls_manifest`가 느리면 stream publish readiness, HLS segment generation, edge proxy timeout을 본다.
- WebRTC first frame은 API latency보다 ICE candidate 품질, TURN relay 여부, browser decoder 상태의 영향을 더 크게 받는다.
- `relay_ratio`가 높으면 TURN 서버 자체 교체보다 먼저 MediaMTX public candidate, 8189/UDP, coturn realm/credential, NAT 종류를 확인한다.
- `selected_ice_protocol=tcp`가 반복되면 실시간성 저하 가능성이 크므로 UDP path와 방화벽 정책을 우선 점검한다.

## 2026-06-19 운영 profile 실측
측정 대상은 Server-01 public edge `https://a4ai.tplinkdns.com`의 `m7` profile이다. sample stream은 로컬 synthetic WHIP publisher로 `raw.sample.front`와 `raw.nat.smoke` 경로에 publish했고, 자체서명 인증서 환경이므로 benchmark에는 `--insecure`를 명시했다. 비밀번호와 token은 profile 파일에 넣지 않고 환경 변수로만 주입했다.

### API/HLS latency
반복 횟수는 warmup 2회, 측정 8회다. 모든 metric은 error 0으로 통과했다.

| metric | samples | errors | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| `auth_login` | 8 | 0 | 80.947 | 103.151 | 103.151 |
| `auth_refresh` | 8 | 0 | 35.195 | 37.324 | 37.324 |
| `ops_event_metrics` | 8 | 0 | 39.234 | 48.477 | 48.477 |
| `ops_event_graphql_page` | 8 | 0 | 36.982 | 39.840 | 39.840 |
| `stream_list` | 8 | 0 | 32.771 | 37.852 | 37.852 |
| `stream_playback` | 8 | 0 | 33.584 | 43.374 | 43.374 |
| `stream_ice_servers` | 8 | 0 | 30.940 | 38.607 | 38.607 |
| `hls_manifest` | 8 | 0 | 28.485 | 31.095 | 31.095 |

### WebRTC publish/play latency
같은 public edge에서 STUN direct 후보를 기본으로 사용했다. WHEP playback은 ICE `completed`까지 도달했고 첫 video frame을 수신했다.

| metric | value |
| --- | ---: |
| WHIP answer latency | 531.2 ms |
| WHIP ICE connected latency | 579.7 ms |
| WHEP answer latency | 276.5 ms |
| WHEP first video frame latency | 922.2 ms |
| WHEP first audio frame latency | 측정 필요 |
| WHEP audio/video sync offset | 측정 필요 |

### 비교 기준 고정 상태
`legacy`, `v0.2.0`, `m7` profile label과 metric schema는 `m7-performance-benchmark-v1`로 고정했다. 운영 중인 profile이 바뀌어도 같은 script, 같은 stream id, 같은 metric name으로 재측정하면 이전 baseline과 직접 비교할 수 있다. 현재 live 운영 기준선은 위 `m7` 실측값으로 본다.

## 완료 기준
- legacy, v0.2.0, m7 중 실행 가능한 profile이 같은 script로 측정된다.
- 결과 JSON에 `schemaVersion: m7-performance-benchmark-v1`가 포함된다.
- 결과 JSON 또는 check output에 `iceProfileLabels: ["stun-direct", "turn-relay"]`가 포함된다.
- 결과 JSON 또는 check output에 `icePathMetrics`와 selected candidate type, ICE RTT, direct/relay ratio 계약이 포함된다.
- API/HLS metric은 p50/p95/max/errors를 가진다.
- WebRTC media 수치는 `m7_publish_play_smoke.sh --run` 또는 browser first-frame smoke 결과와 함께 보고한다.
- 외부 NAT smoke 결과에는 `audio_video_sync_offset_ms` 또는 `Audio/video sync offset ms`가 포함되어야 한다.
- Docker daemon, 포트, 권한 문제로 live run이 실패하면 실패 지점과 재실행 조건을 남긴다.

## M7 final evidence gate

#421의 단일 재현 명령은 아래와 같다.

```bash
python3 scripts/gates/m7_final_evidence_gate.py --run --timeout-seconds 120
```

이 명령은 benchmark schema, telemetry bulk synthetic benchmark, WebRTC ICE static contract, gRPC descriptor smoke, AI overlay metadata smoke, MQTT hardened profile check, closed-network static check, 기본/폐쇄망 compose config를 같은 JSON 결과로 묶는다.
