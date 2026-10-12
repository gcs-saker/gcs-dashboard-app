# Server-01 infrastructure hardening roadmap

Server-01 is the only managed runtime. Infrastructure changes remain code-reviewed,
release-bound, and undeployed until an approved maintenance window. Mobile source,
images, workflows, and deployment are outside this roadmap.

## Delivery sequence

1. Limit every workload to its own PKI material and secrets (#881).
2. Repair MQTT mTLS health and ACL diagnostics (#882).
3. Replace false-positive TURN health with a real STUN probe and retain allocation smoke tests (#883).
4. Include authenticated MediaMTX dependency checks in readiness (#884).
5. Apply least privilege, read-only filesystems, and bounded resources to infrastructure images (#885).
6. Split control, broker, stream, TURN, and edge networks by an explicit allow matrix (#886).
7. Reject mixed source revisions and unapproved upstream digests (#887).
8. Manage host firewall, SSH, Docker, time, audit, and backup drift with idempotent automation (#888).

The umbrella tracker is #890. Stateful recreation always requires a verified backup and
sequential health checks.

## Technology decisions

| Candidate | Current direction | Reason |
| --- | --- | --- |
| Compose secrets plus service-specific mounts | Adopt | Small operational change and immediate reduction of credential blast radius. |
| SOPS with age or systemd credentials | Trial | Keeps encrypted configuration reviewable without adding a continuously available control plane. |
| step-ca short-lived certificates | Trial | Automates internal certificate issuance and rotation while remaining suitable for one server. |
| SPIFFE/SPIRE workload identity | Hold for isolated evaluation | Strong identity model, but control-plane and recovery cost may exceed a single-node deployment. |
| Falco runtime detection | Trial | Adds container behavior detection; resource use and alert quality require measurement. |
| OpenTelemetry Collector | Adopt incrementally | Centralizes bounded security and health signals without changing user workflows. |
| k3s with Cilium policy | Hold | Better network policy, but migration and UDP/WebRTC operating cost are not yet justified. |
| gVisor or Kata isolation | Hold | Isolation improves, but TURN and media performance must be proven before adoption. |

Issue #889 owns benchmarks, rollback evidence, and the final adopt/trial/hold decisions.
