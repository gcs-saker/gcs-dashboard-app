# GCS-Saker M7 release cutover evidence - 2026-06-26

## Purpose

This document records the release cutover evidence for #423. It is intentionally written as an operator-facing checklist: what was verified, what failed first, what was fixed, and what still needs live-field validation.

## Release Candidate

- Release line: `v0.7.1` M7 patch release candidate
- Local commit after merge: `c565dc1`
- Server-01 deployed release directory: `/home/user/gcs-saker-runtime/releases/m7-20260626-1658-c565dc1`
- Server-02 deployed release directory: `/home/user/gcs-saker-runtime/releases/m7-20260626-1658-c565dc1`
- Public entrypoint policy: Nginx/edge HTTPS 443 remains the single public application entrypoint.

## What Was Fixed During Cutover

### gRPC descriptor smoke failure

Problem:

- Server host did not have the `protoc` executable.
- `scripts/grpc_runtime_smoke.py` failed at descriptor compile time.

Fix:

- `scripts/grpc_runtime_smoke.py` now tries `protoc` first and falls back to `python -m grpc_tools.protoc`.
- `backend/requirements.txt` pins `grpcio-tools==1.76.0`.

Why it matters:

- The gRPC/protobuf evidence gate no longer depends on an OS-level protobuf compiler package.
- Closed-network bundles can satisfy this requirement through Python dependency packaging.

### Frontend CI flaky publisher test

Problem:

- `LocalWebcamPublisher.test.tsx` waited only for a `role=status` element to exist.
- In CI the status still read `카메라 권한 요청` when the test expected `미리보기 준비`.

Fix:

- Preview assertions now wait for the text transition with `waitFor`.

Why it matters:

- Release gate results are repeatable and not dependent on a fast local scheduler.

### Server host Python compatibility failure

Problem:

- Server host Python was 3.10.
- `backend/core/security.py` imported `datetime.UTC`, which is available in newer Python runtimes but not Python 3.10.
- `telemetry_bulk_benchmark` failed while importing `core.security`.

Fix:

- `backend/core/security.py` now uses `datetime.now(timezone.utc)`.

Why it matters:

- Backend Docker remains pinned to Python 3.12, but host-level smoke import paths no longer fail on Ubuntu's Python 3.10.

## Local Verification

The following commands passed before server deployment:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests -q
npm run test:coverage
npm run build
python3 scripts/m7_final_evidence_gate.py --run --timeout-seconds 120
```

Results:

- Backend tests: `392 passed`, `1 passlib crypt deprecation warning`
- Frontend coverage tests: `228 passed`
- Frontend coverage: statements `84.45%`, branches `73.86%`, functions `87.26%`, lines `86.42%`
- Frontend build: passed
- M7 final evidence gate: `complete=true`, `failedRequired=[]`

## Server Verification

Both servers ran the same command from `/home/user/gcs-saker-runtime/current`:

```bash
python3 scripts/m7_final_evidence_gate.py --run --timeout-seconds 120
```

### Server-01

- `complete`: `true`
- `failedRequired`: `[]`
- `v2_completion_gate`: passed
- `architecture_intent_gate`: passed
- `benchmark_schema`: passed
- `telemetry_bulk_benchmark`: passed in `634.956 ms`
- `webrtc_ice_contract`: passed
- `grpc_contract`: passed
- `ai_overlay_contract`: passed
- `mqtt_hardened_contract`: passed
- `closed_network_static`: passed
- `default_compose_config`: passed
- `closed_network_compose_config`: passed

Health:

- `https://127.0.0.1/`: `200`
- `https://127.0.0.1/healthz`: `200`
- `https://127.0.0.1/auth-policy/healthz`: `200`
- `https://127.0.0.1/media-control/healthz`: `200`

### Server-02

- `complete`: `true`
- `failedRequired`: `[]`
- `v2_completion_gate`: passed
- `architecture_intent_gate`: passed
- `benchmark_schema`: passed
- `telemetry_bulk_benchmark`: passed in `638.713 ms`
- `webrtc_ice_contract`: passed
- `grpc_contract`: passed
- `ai_overlay_contract`: passed
- `mqtt_hardened_contract`: passed
- `closed_network_static`: passed
- `default_compose_config`: passed
- `closed_network_compose_config`: passed

Health:

- `https://127.0.0.1/`: `200`
- `https://127.0.0.1/healthz`: `200`
- `https://127.0.0.1/auth-policy/healthz`: `200`
- `https://127.0.0.1/media-control/healthz`: `200`

## Release Gate Decision

The M7 release cutover gate is passed for the repo-verifiable and server-verifiable release candidate scope:

- architecture evidence gate passes locally and on both servers
- benchmark contracts are reproducible
- default and closed-network compose models parse
- server edge health routes pass
- gRPC/protobuf, MQTT/protobuf, AI overlay metadata, ICE observability contracts pass
- rollback is symlink-based through the previous release directory

## Non-Blocking Follow-Up

The following are not release blockers for the M7 cutover but remain required before a broader field rollout:

- same-condition live benchmark between legacy, `v0.2.0`, and current M7
- two external NAT endpoints with multi-minute WHIP/WHEP soak
- real TURN primary/secondary failure injection with connected publisher and dashboard receiver
- MediaMTX stop/start recovery timing with first-frame measurement
- Redis restart/degraded dashboard status observation in a live compose stack
- official certificate/domain replacement for the current self-signed staging mode

## Rollback

Rollback uses the existing release symlink strategy:

1. Find the previous release directory under `/home/user/gcs-saker-runtime/releases`.
2. Point `/home/user/gcs-saker-runtime/current` back to the previous release.
3. Restart containers only if the changed artifact is loaded by a running process.
4. Verify:
   - `/`
   - `/healthz`
   - `/auth-policy/healthz`
   - `/media-control/healthz`

Secrets, raw credentials, private key paths, and server-private env values are not recorded in this document.
