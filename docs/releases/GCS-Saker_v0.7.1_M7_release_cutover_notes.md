# GCS-Saker v0.7.1 M7 Release Cutover Notes

Date: 2026-06-26 KST

## Summary

`v0.7.1` is the M7 release cutover patch. It does not claim that every future migration candidate is now active. It means the M7 active runtime path has a reproducible release gate, both operation servers have the same evidence gate result, and the remaining large-field validation items are tracked as non-blocking follow-up.

## Main Changes Since v0.7.0

- M7 final evidence gate was added.
- gRPC descriptor smoke now falls back from `protoc` to `grpc_tools.protoc`.
- AI overlay metadata contract smoke was added.
- Closed-network appliance profile static and compose gates were added.
- WebRTC ICE candidate path metrics were added.
- Backend UTC timestamp generation was made host-smoke compatible while preserving UTC semantics.
- Frontend publisher test timing was stabilized.

## Release Evidence

Primary evidence document:

- `docs/operations/GCS-Saker_M7_release_cutover_evidence_2026-06-26.md`

Required local command:

```bash
python3 scripts/gates/m7_final_evidence_gate.py --run --timeout-seconds 120
```

Required completion command:

```bash
python3 scripts/gates/v2_completion_gate.py --require-complete
```

## Test Result Summary

- Backend tests: `392 passed`, `1 passlib crypt deprecation warning`
- Frontend coverage tests: `228 passed`
- Frontend coverage: statements `84.45%`, branches `73.86%`, functions `87.26%`, lines `86.42%`
- Frontend build: passed
- Server-01 final evidence gate: `complete=true`
- Server-02 final evidence gate: `complete=true`
- Server-01 HTTPS health routes: 200
- Server-02 HTTPS health routes: 200

## Known Non-Blocking Items

- Same-condition live benchmark between legacy, `v0.2.0`, and current M7 remains to be repeated.
- Multi-minute external NAT WHIP/WHEP soak remains a field validation item.
- Real Redis/TURN/MediaMTX live failure injection remains a field validation item.
- Current staging certificate strategy must be replaced by the final domain/certificate plan.
- GitHub dependency graph still reports default branch vulnerabilities and must be handled in the dedicated security cleanup path.

## Rollback

Rollback is based on server release directories and the `current` symlink:

```bash
ln -sfnT /home/user/gcs-saker-runtime/releases/<previous-release> /home/user/gcs-saker-runtime/current
```

After rollback, verify:

- `/`
- `/healthz`
- `/auth-policy/healthz`
- `/media-control/healthz`

Do not publish secrets, private key paths, operator passwords, or raw server env values in release notes.
