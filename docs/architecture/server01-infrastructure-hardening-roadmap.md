# Server-01 infrastructure hardening roadmap

Server-01 is the only managed runtime. Infrastructure changes remain code-reviewed,
release-bound, and undeployed until an approved maintenance window. Mobile source,
images, workflows, and deployment are outside this roadmap.

## Delivery sequence

1. Reduce immediate credential and health risk: #881, #892, #882, and completed #883.
2. Make readiness and isolation trustworthy: #884, #885, and #886.
3. Enforce release and host configuration integrity: #887 and #888.
4. Add bounded observability and security pilots: #894, #893, and #895.

The umbrella tracker is #890. Stateful recreation always requires a verified backup and
sequential health checks.

## Tail backlog added on 2026-10-15

The existing DB (#920), orchestration/network (#922/#923) and certificate/runtime
pilots (#893/#895) keep their current priority. The following ideas are appended
after those validation stages, not inserted ahead of them:

1. #945: minimal device-binding projection; remove unnecessary sensor/stream reads
   without weakening fresh group, device-state or credential/policy-version checks.
2. #946: authorized bulk lookup for only the requested opaque identities, capped at
   100; define partial-result privacy and preserve existing mobile callers.
3. #947: explicit list-summary DTO/projection and selected-device detail reads;
   measure payload/DB/HTTP costs before changing dashboard consumers.

These items do not authorize production deployment or mobile source/image changes.

## Technology decisions

The machine-readable decision record is
`docs/architecture/server01-infrastructure-technology-decisions.yml`; #889 owns
its review. Only `ADOPT` and `TRIAL` entries receive implementation issues.

| Candidate | Current direction | Reason |
| --- | --- | --- |
| Compose secrets plus service-specific mounts | Adopt | Small operational change and immediate reduction of credential blast radius. |
| SOPS with age plus systemd credentials | Adopt | Keeps encrypted configuration reviewable without adding a continuously available control plane. |
| step-ca short-lived certificates | Isolated trial | Automates internal certificate issuance and rotation, but reload and CA recovery need proof. |
| SPIFFE/SPIRE workload identity | Hold for isolated evaluation | Strong identity model, but control-plane and recovery cost may exceed a single-node deployment. |
| Falco runtime detection | Trial | Adds container behavior detection; resource use and alert quality require measurement. |
| OpenTelemetry Collector | Adopt incrementally | Centralizes bounded security and health signals without changing user workflows. |
| k3s with Cilium policy | Hold | Better network policy, but migration and UDP/WebRTC operating cost are not yet justified. |
| gVisor or Kata isolation | Hold | Isolation improves, but TURN and media performance must be proven before adoption. |

SPIFFE/SPIRE, k3s/Cilium, gVisor, and Kata remain `HOLD` and deliberately have
no implementation issue. They are reconsidered only when the trigger in the decision
record is satisfied.
