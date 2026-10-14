# Collector validation evidence — local Docker, 2026-10-14

| Check | Result | Evidence |
|---|---|---|
| Isolated pressure test | PASS | 96 trace requests; fault queue capacity 1, enqueue drops 95, export failure 1 |
| Export privacy | PASS | Synthetic private resource/scope/span/event/link values absent from detailed debug export; sanitized request/event records present |
| Authentication DAST | PASS | All 15 scenarios; unsupported login method 401 without auth, 405 with auth |
| API during Collector outage | PASS | Health/readiness, login, telemetry write/read, stream status and media-control health |
| TURN credentials | PASS | Valid allocation and invalid-password 401 denial |
| Normal synthetic WHIP/WHEP | PASS | Decoded video 640×360 at 113.3 ms; audio at 125.1 ms |
| Collector stopped during synthetic publish/play | PASS | Decoded video at 482.1 ms; audio at 134.6 ms; existing 2,000 ms first-frame budget unchanged |
| Cross-group playback | PASS | Sibling group playback denied with 403 |
| Physical mobile publisher and Talkback | BLOCKED | No physical device/listening endpoint available; the mobile application container is the existing local stand-in |
| HLS playback | NOT_RUN | Synthetic publisher used VP8/Opus and HLS mode was disabled |
| Server-01 deployment | NOT_RUN | This batch changes source and local test infrastructure only |

The first synthetic media run received frames but failed the latency budget (video 4,518.8 ms, audio 4,091.2 ms). The test client was attached only to `stream-net`, while its configured STUN peer was isolated on `turn-net`. Attaching only the disposable test clients to both networks reduced offer gathering from 3,958.1 ms to 4.8 ms. No production service network membership or latency threshold was relaxed.

Audio/video sync offsets were measured (11.8 ms normally, 347.6 ms during the second connection) but are not an acoustic clarity qualification or a long-running jitter/latency assessment. Physical Talkback remains tracked by #659 and physical mobile/WHEP qualification by #648. #894 remains open for these missing end-to-end qualification claims.

Reproduce software-only evidence:

```bash
python scripts/smoke/otel_collector_pressure_smoke.py --run
STOP_STACK=1 RUN_AUTH_DAST=1 RUN_OTEL_FAIL_OPEN_SMOKE=1 \
RUN_PUBLISH_PLAY_SMOKE=1 RUN_OTEL_OUTAGE_DURING_PLAYBACK=1 \
PUBLISH_DURATION_SECONDS=180 bash scripts/smoke/m7_single_node_runtime_smoke.sh --run
```

Windows Git Bash requires a working `python3` command mapped to the installed Python runtime. Credentials emitted to Bash are explicitly LF-only. The pressure test uses its own disposable internal network; the full-stack smoke uses the dedicated local PoC project. Neither command targets Server-01 or Server-02.
