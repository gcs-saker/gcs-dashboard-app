# Server-01 audit clock runtime evidence — 2026-09-08

## Scope

- Managed runtime: Server-01 production only
- Deployed source: `9f959348b2573ecf4cf0a2f457bbdf0ae5e70a49`
- CI: `https://github.com/gcs-saker/gcs-dashboard-app/actions/runs/34178203341` attempt 2
- Pre-deployment PostgreSQL custom-format dump, SHA-256 digest, and restore listing: `PASS`

No credential, token, private route, raw username, device UUID, or host address is included in this evidence.

## Results

| Check | Verdict | Sanitized evidence |
|---|---|---|
| Public health and readiness | PASS | Both public probes returned success after deployment. |
| Authorization denial | PASS | Unauthenticated stream listing returned HTTP 401. |
| Immutable source revision | PASS | All four application containers reported the expected source revision and healthy state. |
| Stateful service preservation | PASS | PostgreSQL, Redis, MQTT, MediaMTX, TURN, publisher, and edge remained running. |
| Flyway audit migrations | PASS | Schema reached version 28, including audit chain and clock-evidence fields. |
| NTP reachability | PASS | Scheduled unauthenticated NTP probes completed without scheduler exceptions. |
| Clock classification | PASS | Consecutive samples were `NORMAL`; observed absolute drift was 0–4 ms against a 1,000 ms warning threshold. |
| Audit clock binding | PASS | A controlled login denial stored `clockStatus=NORMAL`, drift, source, received/measured timestamps, and two 64-character chain hashes. |
| Software WORM anchor | PASS | The first signed anchor was created for the current one-record hashed chain on the dedicated volume. |
| Authenticated time source | BLOCKED | The public NTP source is explicitly `ntp-unauthenticated`; approved internal NTP or NTS is not available. |
| External immutable/WORM storage | BLOCKED | The anchor volume is software staging on the same host, not independent immutable storage. |

## Incident and recovery note

The first deployment attempt passed application health but failed the immutable-release-directory provenance gate.
The deployment automation restored the previous release, and public health, readiness, and the previous container
revision were verified before retrying from a correctly located immutable checkout. A later runtime probe exposed an
unresolved NTP address on the internal-only network. That failure was converted to a typed `UNKNOWN` clock result,
the auth-policy service received outbound-only network access without publishing a new port, CI was rerun, and the
fixed revision above was deployed successfully.

## Remaining assurance

This evidence supports the software clock-drift and local anchor claims only. It does not claim NTS authentication,
GPS/PTP traceability, an accredited time laboratory result, or external WORM immutability.
