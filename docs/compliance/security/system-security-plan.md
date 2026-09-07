# GCS-Saker System Security Plan — software baseline

## Authorization boundary

The boundary contains the browser dashboard, public TLS edge, backend compatibility API,
auth-policy, media-control, PostgreSQL, Redis, MQTT, MediaMTX, TURN, deployment automation, and
their contracts. Server-01 is the sole managed production runtime. Developer workstations, GitHub
hosted runners, future AI sidecars, field hardware, and external tactical networks are external or
interconnected systems and require explicit trust-boundary decisions.

## Information and critical functions

The system handles account and group policy, device identity, telemetry, location, media session
metadata, Talkback authorization, operational events, and future waypoint/AI metadata. Credentials,
tokens, private routes, raw private media, and exact infrastructure details are sensitive and excluded
from public evidence. Mission commands and group authorization are safety and security significant.

## Control implementation summary

Identity and authorization are server-owned, public ingress is TLS, media uses DTLS-SRTP, internal
state services remain private, security events are structured and redacted, dependencies and images
are scanned, releases bind immutable commits to image revisions, and deployment preserves stateful
services with backup and rollback evidence. The authoritative tailored controls and open assessment
state are in `rmf-control-matrix.yml`.

## Open boundary decisions

Internal gRPC/MQTT/database encryption, administrator MFA, short-lived TURN credentials, signed
artifacts, WORM audit retention, AI model trust, waypoint command safety, full STIG tailoring, and
external assessor independence remain open work tracked by the M12 milestone.

