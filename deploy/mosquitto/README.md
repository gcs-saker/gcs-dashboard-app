# GCS-Saker Mosquitto Hardened Profile

This directory contains the default hardened MQTT broker configuration for the single-node and local dashboard runtimes.

The promoted single-node runtime listens only on `8883`, requires TLS 1.3 client certificates, checks the CRL, and uses the certificate CN as the broker username. Password files belong only to explicitly named legacy/local-test profiles and must not be used to weaken the promoted listener.

The dashboard must never receive MQTT credentials. It continues to use REST/JSON and WebRTC/HLS through the edge proxy.

## Topic namespace

| Channel | Topic | Direction | Payload boundary |
| --- | --- | --- | --- |
| Telemetry | `gcs/device/{deviceUuid}/{publishSession}/telemetry` | device -> media-control | `MqttGatewayMessage` protobuf |
| Result | `gcs/device/{deviceUuid}/{publishSession}/result` | media-control -> device | `GatewayStreamResponse` protobuf |
| Command | `gcs/device/{deviceUuid}/{publishSession}/command` | media-control -> device | `ControlCommandEnvelope` protobuf |
| Command ACK | `gcs/device/{deviceUuid}/{publishSession}/command_ack` | device -> media-control | `ControlCommandAck` protobuf |
| Ops event | `gcs/ops/{service}/event` | backend/media-control -> ops read model | transitional JSON |

Media frames must not be carried by MQTT. WebRTC/HLS media continues to use MediaMTX. MQTT is only for telemetry, health, command, command ACK, and operational events.

## Runtime smoke

Run the isolated profile smoke from the repository root:

```bash
pki_dir="$(mktemp -d)"
trap 'rm -rf -- "$pki_dir"' EXIT
INCLUDE_MQTT_SMOKE_IDENTITY=1 scripts/ops/prepare_internal_pki.sh "$pki_dir"
python3 scripts/smoke/mqtt_hardened_profile_smoke.py --run --pki-dir "$pki_dir"
```

The smoke uses an isolated PKI created with `INCLUDE_MQTT_SMOKE_IDENTITY=1`, starts only the hardened MQTT service, verifies anonymous rejection, publishes certificate-bound device telemetry, subscribes as `gcs_media_control`, and verifies command delivery in the reverse direction. Cleanup uses `docker compose down --remove-orphans` for the isolated project and never removes volumes.

No-auth MQTT is not a default runtime. If a legacy local smoke needs it, use `gcs-dashboard/docker-compose.mqtt-no-auth.profile.yml` with the `local-mqtt-no-auth` profile and do not reuse it for staging, production, or closed-network runs.
