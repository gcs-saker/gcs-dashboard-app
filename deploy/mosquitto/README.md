# GCS-Saker Mosquitto Hardened Profile

This directory contains the default hardened MQTT broker configuration for the single-node runtime.

Do not commit a real Mosquitto password file. Generate it locally and point `MQTT_PASSWORD_FILE` at that file from `deploy/compose/.env.single-node`. The broker is no longer promoted through a separate override file; `deploy/compose/compose.single-node.poc.yml` mounts this hardened config by default.

Example:

```bash
docker run --rm -it -v "$PWD/deploy/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -c /work/passwords.local gcs_backend_pub
docker run --rm -it -v "$PWD/deploy/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd /work/passwords.local gcs_media_control
docker run --rm -it -v "$PWD/deploy/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd /work/passwords.local gcs_device_gateway
```

The dashboard must never receive MQTT credentials. It continues to use REST/JSON and WebRTC/HLS through the edge proxy.

## Topic namespace

| Channel | Topic | Direction | Payload boundary |
| --- | --- | --- | --- |
| Telemetry | `gcs/{orgId}/{groupId}/{assetId}/telemetry` | device gateway -> backend/auth-policy/media-control | Protobuf `TelemetryEnvelope` only |
| Status | `gcs/{orgId}/{groupId}/{assetId}/status` | device gateway -> backend/auth-policy/media-control | transitional JSON/text until a status proto is promoted |
| Command | `gcs/{orgId}/{groupId}/{assetId}/command` | backend/media-control -> device gateway | protobuf command is preferred; text is allowed only for local smoke/fallback |
| Command ACK | `gcs/{orgId}/{groupId}/{assetId}/command_ack` | device gateway -> backend/media-control | transitional JSON/text until an ACK proto is promoted |
| Ops event | `gcs/ops/{service}/event` | backend/media-control -> ops read model | transitional JSON |

Media frames must not be carried by MQTT. WebRTC/HLS media continues to use MediaMTX. MQTT is only for telemetry, health, command, command ACK, and operational events.

## Runtime smoke

Run the isolated profile smoke from the repository root:

```bash
python3 scripts/smoke/mqtt_hardened_profile_smoke.py --run
```

The smoke creates a temporary password file outside the repository, starts only the default hardened MQTT service in an isolated compose project, verifies anonymous rejection, publishes protobuf telemetry from `gcs_device_gateway`, subscribes as `gcs_backend_pub`, then verifies command delivery in the reverse direction. Cleanup uses `docker compose down --remove-orphans` for the isolated project and never removes volumes.
