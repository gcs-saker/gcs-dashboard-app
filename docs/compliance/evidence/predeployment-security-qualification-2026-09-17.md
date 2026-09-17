# Predeployment security qualification — 2026-09-17

## Scope

- Tested source commit: `6c38de371fd223eef2d097f1e8993fec21e2cd5d`
- Signed release source commit: `b1bda30214fc59bd2e5a86a2b9ba4275ed83cff7`
- Signed release run: `35182450271`
- Target: isolated local Docker stack only
- Production deployment: `NOT_RUN`
- Physical mobile equipment: unavailable

No credential, token, private route, username, device UUID, or public host address is retained in this evidence.

## Results

| Work item | Verdict | Evidence and residual risk |
| --- | --- | --- |
| 1. Dependency vulnerability triage | PASS | Clean `npm ci` followed by `npm audit --json`: 0 vulnerabilities across 667 dependencies. GitHub still lists 53 alerts against packages absent from the current lockfile; these are retained as stale-alert reconciliation work, not dismissed as accepted risk. |
| 2. License evidence | BLOCKED | All seven server images are permitted for internal service deployment. Distribution remains blocked: auth-policy 15 review/52 unknown, backend 76/35, dashboard 12/2, media-control 0/30, MediaMTX 0/86, MQTT 10/1, TURN 95/28. Issues #709, #711, and #712 remain open. |
| 3. Docker media/data E2E | BLOCKED | MQTT, gRPC, TURN, WHIP/WHEP, HLS, and ICE smoke contracts passed. Full authenticated publish/play with physical mobile audio was not executed and is not reported as PASS. |
| 4. Authentication attack checks | PASS | Live local DAST rejected unauthenticated admin, GraphQL, and WebSocket access; malformed JSON, oversized login, and encoded traversal were rejected. |
| 5. Internal service trust boundary | BLOCKED | Secure-channel, device-authentication, and mTLS configuration contracts passed. Complete runtime mTLS coverage and certificate rotation across every service remain external qualification work under #662. |
| 6. Audit and clock integrity | BLOCKED | Audit-chain, offload, recovery, secure-channel, and STIG/RMF contract tests passed. Independent external anchor storage and closed-network trusted-time qualification remain under #664. |
| 7. Failure and recovery | PASS | MQTT and MediaMTX restart checks passed. A real version/config drift defect was detected: MediaMTX v1.15.3 rejected v1.21 CORS keys, which then blocked TURN peer resolution. The stack recovered after candidate-compatible MediaMTX and TURN recreation. A candidate-config preflight was added to prevent recurrence. Redis, PostgreSQL, stack readiness, and MediaMTX API recovery passed. |
| 8. Voice qualification | BLOCKED | Synthetic voice, latency, jitter, packet-loss, clipping, silence, and qualification contracts passed. MIL-STD-1472H operator intelligibility and real mobile Talkback remain blocked on physical equipment under #648 and #659. |
| 9. Traceability and evidence | PASS | This record binds findings, commands, immutable source, signed-release run, negative results, and residual risks without converting missing external evidence into PASS. |

## Executed Docker checks

- Hardened MediaMTX, MQTT, and TURN image scans: no fixed High or Critical findings.
- Signed release v3: eight immutable images with SPDX SBOM, SLSA provenance, and Cosign signatures.
- Security and qualification contract selection: 42 passed.
- DAST and deployment-preflight regression selection: 6 passed.
- MQTT, gRPC, TURN, WebRTC ICE, WHIP, WHEP, HLS, and external-NAT smoke contracts: passed.
- Sequential local restart and recovery: MQTT, MediaMTX, TURN, Redis, PostgreSQL, edge readiness, and MediaMTX API checked.

## Residual-risk disposition

Deployment remains deliberately deferred. The next safe work is license metadata remediation, complete runtime mTLS qualification, independent audit-anchor/time qualification, and physical mobile audio/Talkback testing. None of those items may be promoted from `BLOCKED` to `PASS` using contract tests alone.
