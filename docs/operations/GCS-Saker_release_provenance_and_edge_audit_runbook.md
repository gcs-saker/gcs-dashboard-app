# Release provenance and public-edge audit runbook

## Atomic release rule

Run `scripts/ops/safe_stateless_deploy.sh` only from an immutable release checkout. The script tags every repository-built application image with the full source commit, writes that inventory into `release-manifest.json`, and verifies the OCI revision label on every recreated container. Any mismatch triggers the captured stateless rollback.

Only Server-01 production is managed. Set `DEPLOYMENT_TARGET=server01-production` and `COMPOSE_PROJECT_NAME=gcs-saker-m2-production`; any other target fails before mutation. The script discovers the previous Compose file from the running backend container and uses that file for rollback. Builds happen before the rollback trap is armed, and container IDs for PostgreSQL, Redis, MQTT, MediaMTX, TURN, and the external publisher must remain unchanged.

Before an intentional MQTT container recreation, run `scripts/ops/prepare_mqtt_password_file.sh <absolute-password-file>`. It keeps owner-only mode semantics and grants read-only ACL access solely to the Mosquitto runtime UID (default `1883`). Stateless deployment never recreates MQTT.

The mobile publisher is an externally supplied artifact and is intentionally not rebuilt by this repository. Its source, digest, and owner must be recorded by its own artifact pipeline before changing `MOBILE_PUBLISHER_IMAGE`. A container in a restart loop that is not part of the Compose project is evidence of a conflicting owner; identify its Compose labels and owner before stopping or removing it.

## Public client audit log

Caddy writes structured access events to `/data/gcs-access.json`, which is inside the existing persistent Caddy data volume. Files are owner-only (`0600`), rotate at 100 MiB, retain ten files, and expire after 30 days. The log records Caddy's direct client address, method, URI path, status, duration, and request headers. Caddy's built-in redaction covers Authorization and Cookie; GCS UUID/credential/publish-token headers are deleted explicitly, and the query string is removed.

Use the JSON `request.remote_ip`, `request.method`, `request.uri`, `status`, and `duration` fields during incident response. Do not change Caddy's trusted proxy configuration merely to accept caller-supplied `X-Forwarded-For`; the public Caddy socket is the authoritative client boundary. Restrict `/data/gcs-access*.json*` to the Caddy runtime account and authorized operators.

After deployment, send one successful request and one unauthorized request, then confirm both source IPs and statuses are present while the tested credential string is absent. Monitor the Caddy data volume for disk pressure.
