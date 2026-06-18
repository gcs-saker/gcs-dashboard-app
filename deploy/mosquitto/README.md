# GCS-Saker Mosquitto Hardened Profile

This directory contains the local hardened MQTT broker configuration for M8 protocol migration.

Do not commit a real Mosquitto password file. Generate it locally and point `MQTT_PASSWORD_FILE` at that file from `deploy/compose/.env.single-node`.

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
