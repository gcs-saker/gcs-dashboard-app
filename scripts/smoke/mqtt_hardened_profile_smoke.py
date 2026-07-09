#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
ENV_FILE = REPO_ROOT / "deploy" / "compose" / ".env.single-node.example"
SCHEMA_VERSION = "mqtt-hardened-profile-smoke-v1"
DEFAULT_PROJECT_NAME = "gcs-saker-mqtt-profile-smoke"
CLIENT_IMAGE = "eclipse-mosquitto:2"
BACKEND_USER = "gcs_backend_pub"
MEDIA_CONTROL_USER = "gcs_media_control"
DEVICE_USER = "gcs_device_gateway"
BACKEND_PASSWORD = "smoke-backend-pass"
MEDIA_CONTROL_PASSWORD = "smoke-media-control-pass"
DEVICE_PASSWORD = "smoke-device-gateway-pass"
ORG_ID = "a4ai"
GROUP_ID = "co-a"
ASSET_ID = "raw.mobile.front"
TELEMETRY_TOPIC = f"gcs/{ORG_ID}/{GROUP_ID}/{ASSET_ID}/telemetry"
COMMAND_TOPIC = f"gcs/{ORG_ID}/{GROUP_ID}/{ASSET_ID}/command"
TELEMETRY_SUBSCRIPTION = "gcs/+/+/+/telemetry"


@dataclass(frozen=True)
class MqttHardenedProfileConfig:
    compose_file: Path
    override_file: Path | None
    env_file: Path
    project_name: str

    def compose_command(self, env_file: Path | None = None) -> list[str]:
        command = [
            "docker",
            "compose",
            "-p",
            self.project_name,
            "--env-file",
            str(env_file or self.env_file),
            "-f",
            str(self.compose_file),
        ]
        if self.override_file is not None:
            command.extend(["-f", str(self.override_file)])
        return command

    def config_command(self, env_file: Path | None = None) -> list[str]:
        return [*self.compose_command(env_file), "config", "--quiet"]

    def up_command(self, env_file: Path | None = None) -> list[str]:
        return [*self.compose_command(env_file), "up", "-d", "mqtt"]

    def down_command(self, env_file: Path | None = None) -> list[str]:
        return [*self.compose_command(env_file), "down", "--remove-orphans"]

    def network_name(self) -> str:
        return f"{self.project_name}_media-net"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate the hardened MQTT protobuf telemetry profile.")
    parser.add_argument("--check", action="store_true", help="Print the stable smoke contract without executing docker.")
    parser.add_argument("--run", action="store_true", help="Run the hardened Mosquitto publish/subscribe smoke with docker.")
    parser.add_argument("--compose-file", type=Path, default=COMPOSE_FILE)
    parser.add_argument("--override-file", type=Path, default=None, help="Optional legacy compose override for compatibility checks.")
    parser.add_argument("--env-file", type=Path, default=ENV_FILE)
    parser.add_argument("--project-name", default=DEFAULT_PROJECT_NAME)
    return parser


def smoke_contract(config: MqttHardenedProfileConfig) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "status": "hardened-profile-runtime-contract",
        "profile": {
            "composeMode": "default-hardened",
            "composeCommand": config.compose_command(),
            "configCommand": config.config_command(),
            "readinessCommand": config.up_command(),
            "overrideFile": str(config.override_file) if config.override_file is not None else None,
            "runtime": CLIENT_IMAGE,
        },
        "topicNamespace": {
            "telemetry": "gcs/{orgId}/{groupId}/{assetId}/telemetry",
            "status": "gcs/{orgId}/{groupId}/{assetId}/status",
            "command": "gcs/{orgId}/{groupId}/{assetId}/command",
            "commandAck": "gcs/{orgId}/{groupId}/{assetId}/command_ack",
            "opsEvent": "gcs/ops/{service}/event",
        },
        "allowedFlows": [
            "device gateway publishes protobuf telemetry to gcs/{org}/{group}/{asset}/telemetry",
            "backend subscribes telemetry/status and publishes command",
            "device gateway subscribes command and publishes command_ack",
            "dashboard never receives MQTT credentials and uses edge REST/WebRTC/HLS instead",
        ],
        "deniedFlows": [
            "anonymous MQTT clients are rejected",
            "browser/dashboard clients do not have broker users",
            "legacy robot/control topics are rejected by bridge parser",
        ],
        "protobufBoundary": {
            "telemetry": "protobuf TelemetryEnvelope only on the device/native gateway path",
            "mediaFrames": "never carried by MQTT; WebRTC/HLS stays on MediaMTX",
            "dashboard": "REST/JSON and WHEP/HLS only",
            "transitional": "status, command_ack, and ops event may remain JSON/text until dedicated proto contracts are promoted",
        },
        "runtimeChecks": [
            "docker compose config --quiet with default hardened MQTT service",
            "Mosquitto password file generated outside the repository",
            "anonymous subscribe denied",
            "device telemetry publish reaches backend subscriber",
            "backend command publish reaches device subscriber",
            "telemetry payload survives MQTT as protobuf bytes and decodes with matching topic identity",
        ],
        "safety": [
            "COMPOSE_PROJECT_NAME from inherited env files is filtered and replaced by the explicit smoke project name",
            "cleanup uses docker compose down --remove-orphans only on the isolated smoke project",
            "cleanup never uses down -v",
            "real broker passwords are not written to the repository",
        ],
        "promotionGate": "Keep default hardened MQTT active only when runtime smoke and broker credential rotation drill pass.",
    }


def main() -> int:
    args = build_parser().parse_args()
    config = MqttHardenedProfileConfig(
        compose_file=args.compose_file,
        override_file=args.override_file,
        env_file=args.env_file,
        project_name=args.project_name,
    )

    if args.check or not args.run:
        print(json.dumps(smoke_contract(config), ensure_ascii=False, indent=2))
        return 0

    result = run_smoke(config)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def run_smoke(config: MqttHardenedProfileConfig) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="gcs-saker-mqtt-smoke-") as tmp:
        tmp_dir = Path(tmp)
        password_file = tmp_dir / "passwords"
        generated_env = tmp_dir / "mqtt-smoke.env"
        telemetry_payload = tmp_dir / "telemetry.bin"
        telemetry_received = tmp_dir / "telemetry.received.bin"
        command_payload = tmp_dir / "command.txt"
        command_received = tmp_dir / "command.received.txt"

        write_password_file(password_file)
        write_generated_env(config.env_file, generated_env, password_file)
        write_telemetry_payload(telemetry_payload)
        command_payload.write_text("return-to-base", encoding="utf-8")

        checks: list[dict[str, Any]] = []
        try:
            run_checked(config.config_command(generated_env), name="compose.config")
            run_checked(config.up_command(generated_env), name="compose.up")
            wait_for_mqtt(config)

            anonymous = run_client(
                config,
                "mosquitto_sub",
                "-h",
                "mqtt",
                "-p",
                "1883",
                "-t",
                "$SYS/broker/version",
                "-C",
                "1",
                "-W",
                "1",
                check=False,
            )
            checks.append(
                {
                    "name": "anonymous.denied",
                    "passed": anonymous.returncode != 0,
                    "returnCode": anonymous.returncode,
                }
            )
            if anonymous.returncode == 0:
                raise AssertionError("anonymous MQTT client was not rejected")

            subscribe_and_publish(
                config=config,
                subscriber_user=BACKEND_USER,
                subscriber_password=BACKEND_PASSWORD,
                topic=TELEMETRY_SUBSCRIPTION,
                output_path=telemetry_received,
                publisher_user=DEVICE_USER,
                publisher_password=DEVICE_PASSWORD,
                publish_topic=TELEMETRY_TOPIC,
                payload_path=telemetry_payload,
            )
            checks.append(assert_bytes_equal("telemetry.protobuf.roundtrip", telemetry_received.read_bytes(), telemetry_payload.read_bytes()))
            checks.append(assert_telemetry_decodes(telemetry_received.read_bytes()))

            subscribe_and_publish(
                config=config,
                subscriber_user=DEVICE_USER,
                subscriber_password=DEVICE_PASSWORD,
                topic=COMMAND_TOPIC,
                output_path=command_received,
                publisher_user=BACKEND_USER,
                publisher_password=BACKEND_PASSWORD,
                publish_topic=COMMAND_TOPIC,
                payload_path=command_payload,
            )
            checks.append(assert_bytes_equal("command.delivery.roundtrip", command_received.read_bytes(), command_payload.read_bytes()))

            return {
                **smoke_contract(config),
                "passed": True,
                "checks": checks,
            }
        finally:
            run_checked(config.down_command(generated_env), name="compose.down", allow_failure=True)


def write_password_file(password_file: Path) -> None:
    run_checked(
        [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{password_file.parent}:/work",
            CLIENT_IMAGE,
            "mosquitto_passwd",
            "-b",
            "-c",
            "/work/passwords",
            BACKEND_USER,
            BACKEND_PASSWORD,
        ],
        name="password.backend",
    )
    for username, password in ((MEDIA_CONTROL_USER, MEDIA_CONTROL_PASSWORD), (DEVICE_USER, DEVICE_PASSWORD)):
        run_checked(
            [
                "docker",
                "run",
                "--rm",
                "-v",
                f"{password_file.parent}:/work",
                CLIENT_IMAGE,
                "mosquitto_passwd",
                "-b",
                "/work/passwords",
                username,
                password,
            ],
            name=f"password.{username}",
        )


def write_generated_env(source: Path, target: Path, password_file: Path) -> None:
    lines: list[str] = []
    for line in source.read_text(encoding="utf-8").splitlines():
        if line.startswith("COMPOSE_PROJECT_NAME="):
            continue
        if line.startswith(("MQTT_PASSWORD=", "MQTT_PASSWORD_FILE=", "MQTT_HEALTH_PASSWORD=")):
            continue
        lines.append(line)
    lines.extend(
        [
            f"MQTT_PASSWORD={BACKEND_PASSWORD}",
            f"MQTT_PASSWORD_FILE={password_file}",
            f"MQTT_HEALTH_PASSWORD={BACKEND_PASSWORD}",
        ]
    )
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_telemetry_payload(path: Path) -> None:
    script = f"""
import base64
import sys
from pathlib import Path

sys.path.insert(0, {str(BACKEND_DIR)!r})
from modules.protocol_v2.telemetry import AssetKinds, HealthStates, TelemetryEnvelopePayload

payload = TelemetryEnvelopePayload.create(
    org_id={ORG_ID!r},
    group_id={GROUP_ID!r},
    asset_id={ASSET_ID!r},
    latitude=35.871435,
    longitude=128.601445,
    altitude_m=84.5,
    heading_deg=7.2,
    speed_mps=3.5,
    battery_percent=78.0,
    asset_kind=AssetKinds.OPERATOR_DEVICE,
    health=HealthStates.OK,
    active_stream_ids=("raw/local/webcam",),
).to_protobuf_wire()
Path({str(path)!r}).write_bytes(payload)
print(base64.b64encode(payload).decode("ascii"))
"""
    run_checked([sys.executable, "-c", script], name="telemetry.payload")


def wait_for_mqtt(config: MqttHardenedProfileConfig) -> None:
    deadline = time.time() + 30
    while time.time() < deadline:
        result = run_client(
            config,
            "mosquitto_sub",
            "-h",
            "mqtt",
            "-p",
            "1883",
            "-u",
            BACKEND_USER,
            "-P",
            BACKEND_PASSWORD,
            "-t",
            "$SYS/broker/version",
            "-C",
            "1",
            "-W",
            "2",
            check=False,
        )
        if result.returncode == 0:
            return
        time.sleep(1)
    raise RuntimeError("MQTT broker did not become ready for authenticated health subscription")


def subscribe_and_publish(
    *,
    config: MqttHardenedProfileConfig,
    subscriber_user: str,
    subscriber_password: str,
    topic: str,
    output_path: Path,
    publisher_user: str,
    publisher_password: str,
    publish_topic: str,
    payload_path: Path,
) -> None:
    subscriber = run_client_popen(
        config,
        "sh",
        "-lc",
        "mosquitto_sub -h mqtt -p 1883 -u \"$MQTT_USER\" -P \"$MQTT_PASSWORD\" -t \"$MQTT_TOPIC\" -C 1 -W 8 -N > \"$MQTT_OUTPUT\"",
        env={
            "MQTT_USER": subscriber_user,
            "MQTT_PASSWORD": subscriber_password,
            "MQTT_TOPIC": topic,
            "MQTT_OUTPUT": f"/work/{output_path.name}",
        },
        work_dir=output_path.parent,
    )
    time.sleep(0.7)
    run_client(
        config,
        "mosquitto_pub",
        "-h",
        "mqtt",
        "-p",
        "1883",
        "-u",
        publisher_user,
        "-P",
        publisher_password,
        "-t",
        publish_topic,
        "-q",
        "1",
        "-f",
        f"/work/{payload_path.name}",
        work_dir=payload_path.parent,
    )
    stdout, stderr = subscriber.communicate(timeout=10)
    if subscriber.returncode != 0:
        raise RuntimeError(f"subscriber failed for {topic}: {stdout.decode()} {stderr.decode()}")
    if not output_path.exists():
        raise RuntimeError(f"subscriber did not write output for {topic}")


def run_client(
    config: MqttHardenedProfileConfig,
    *args: str,
    work_dir: Path | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    command = client_command(config, *args, work_dir=work_dir)
    return run_checked(command, name="mqtt.client", check=check)


def run_client_popen(
    config: MqttHardenedProfileConfig,
    *args: str,
    env: dict[str, str],
    work_dir: Path,
) -> subprocess.Popen[bytes]:
    command = client_command(config, *args, work_dir=work_dir, env=env)
    return subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def client_command(
    config: MqttHardenedProfileConfig,
    *args: str,
    work_dir: Path | None = None,
    env: dict[str, str] | None = None,
) -> list[str]:
    command = ["docker", "run", "--rm", "--network", config.network_name()]
    if work_dir is not None:
        command.extend(["-v", f"{work_dir}:/work"])
    for key, value in (env or {}).items():
        command.extend(["-e", f"{key}={value}"])
    command.append(CLIENT_IMAGE)
    command.extend(args)
    return command


def assert_bytes_equal(name: str, actual: bytes, expected: bytes) -> dict[str, Any]:
    if actual != expected:
        raise AssertionError(f"{name}: payload mismatch")
    return {
        "name": name,
        "passed": True,
        "bytes": len(actual),
        "sampleBase64": base64.b64encode(actual[:24]).decode("ascii"),
    }


def assert_telemetry_decodes(payload: bytes) -> dict[str, Any]:
    sys.path.insert(0, str(BACKEND_DIR))
    from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
    from mqtt.consumer_bridge import MqttConsumerBridge

    class Sink:
        def __init__(self) -> None:
            self.item = None

        def upsert(self, telemetry: Any) -> Any:
            self.item = telemetry
            return telemetry

    sink = Sink()
    bridge = MqttConsumerBridge(sink)
    bridge.handle_message(TELEMETRY_TOPIC, payload)
    telemetry = TelemetryEnvelopePayload.from_protobuf_wire(payload)
    if telemetry.org_id != ORG_ID or telemetry.group_id != GROUP_ID or telemetry.asset_id != ASSET_ID:
        raise AssertionError("decoded protobuf identity does not match MQTT topic")
    return {
        "name": "telemetry.protobuf.decode",
        "passed": True,
        "identity": f"{telemetry.org_id}/{telemetry.group_id}/{telemetry.asset_id}",
        "latitude": telemetry.latitude,
        "longitude": telemetry.longitude,
    }


def run_checked(
    command: list[str],
    *,
    name: str,
    check: bool = True,
    allow_failure: bool = False,
) -> subprocess.CompletedProcess[bytes]:
    env = os.environ.copy()
    env["COMPOSE_PROJECT_NAME"] = DEFAULT_PROJECT_NAME if "compose" in name else env.get("COMPOSE_PROJECT_NAME", DEFAULT_PROJECT_NAME)
    result = subprocess.run(command, check=False, capture_output=True, env=env)
    if check and result.returncode != 0 and not allow_failure:
        stdout = result.stdout.decode("utf-8", errors="replace")
        stderr = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"{name} failed with exit {result.returncode}\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
