#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import asdict
from pathlib import Path

from docker_network_fault_fixture import (
    CONDITIONS,
    Runner,
    SubprocessRunner,
    build_command,
    cleanup,
    probe_command,
    validate,
)
from docker_network_path_benchmark import percentile

MOSQUITTO_IMAGE = "eclipse-mosquitto:2.0.22@sha256:09b62ff32c2e7b64d4b431b9a89236073289b68db273de2b089edeb9b0d92b5c"
MQTT_SCRIPT = r"""
import json,os,socket,struct,time
def remaining(value):
  encoded=bytearray()
  while True:
    digit=value%128; value//=128; encoded.append(digit|(128 if value else 0))
    if not value: return bytes(encoded)
def field(value):
  wire=value.encode(); return struct.pack('!H',len(wire))+wire
def exact(connection,count):
  data=b''
  while len(data)<count:
    chunk=connection.recv(count-len(data))
    if not chunk: raise OSError('closed')
    data+=chunk
  return data
def packet(connection):
  first=exact(connection,1)[0]; multiplier=1; length=0
  while True:
    digit=exact(connection,1)[0]; length+=(digit&127)*multiplier
    if not digit&128: break
    multiplier*=128
  return first,exact(connection,length)
host=os.environ['TARGET_HOST']; port=int(os.environ['TARGET_PORT']); samples=int(os.environ['SAMPLES'])
connection=socket.create_connection((host,port),2); connection.settimeout(2)
variable=field('MQTT')+bytes((4,2,0,10)); payload=field('gcs-netem-mqtt-probe')
connection.sendall(bytes((0x10,))+remaining(len(variable)+len(payload))+variable+payload); packet(connection)
topic='gcs/fixture/roundtrip'; subscribe=b'\x00\x01'+field(topic)+b'\x00'
connection.sendall(bytes((0x82,))+remaining(len(subscribe))+subscribe); packet(connection)
latencies=[]; failures=0
for index in range(samples):
  body=field(topic)+str(index).encode(); publish=bytes((0x30,))+remaining(len(body))+body
  try:
    started=time.perf_counter_ns(); connection.sendall(publish); first,_=packet(connection)
    if first>>4!=3: raise OSError('unexpected packet')
    latencies.append((time.perf_counter_ns()-started)/1e6)
  except OSError: failures+=1
connection.close(); print(json.dumps({'mqttRoundTripMs':latencies,'failures':failures}))
"""


def broker_command(network: str, name: str, config: Path) -> list[str]:
    return [
        "docker",
        "run",
        "--detach",
        "--name",
        name,
        "--network",
        network,
        "--network-alias",
        "mqtt",
        "--user",
        "1883:1883",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "64",
        "--memory",
        "64m",
        "--tmpfs",
        "/mosquitto/data:rw,noexec,nosuid,nodev,size=8m",
        "--tmpfs",
        "/mosquitto/log:rw,noexec,nosuid,nodev,size=8m",
        "--volume",
        f"{config}:/mosquitto/config/mosquitto.conf:ro",
        "--entrypoint",
        "mosquitto",
        MOSQUITTO_IMAGE,
        "-c",
        "/mosquitto/config/mosquitto.conf",
    ]


def wait_broker(runner: Runner, broker: str) -> None:
    command = [
        "docker",
        "exec",
        broker,
        "mosquitto_sub",
        "-h",
        "127.0.0.1",
        "-p",
        "1883",
        "-t",
        "$SYS/broker/version",
        "-C",
        "1",
        "-W",
        "1",
    ]
    for _ in range(15):
        try:
            runner.run(command, timeout=5)
            return
        except subprocess.SubprocessError:
            time.sleep(0.2)
    raise RuntimeError("fixture MQTT broker did not become ready")


def summarize(payload: dict[str, object], samples: int) -> dict[str, object]:
    raw = payload.get("mqttRoundTripMs", [])
    if not isinstance(raw, list):
        raise ValueError("MQTT latency payload is invalid")
    values = [float(value) for value in raw]
    return {
        "samples": samples,
        "received": len(values),
        "failures": int(payload.get("failures", samples)),
        "mqttRoundTripMs": {f"p{rank}": percentile(values, rank) for rank in (50, 95, 99)},
    }


def execute(root: Path, project: str, samples: int, runner: Runner) -> dict[str, object]:
    network = f"{project}-net"
    broker = f"{project}-mqtt"
    config = root / "deploy/mqtt-test/mosquitto.conf"
    results = []
    try:
        runner.run(build_command(root), timeout=300)
        runner.run(["docker", "network", "create", "--internal", network])
        runner.run(broker_command(network, broker, config))
        wait_broker(runner, broker)
        for condition in CONDITIONS:
            output = runner.run(
                probe_command(
                    network,
                    condition,
                    samples,
                    probe_script=MQTT_SCRIPT,
                    target_host="mqtt",
                    target_port=1883,
                ),
                timeout=240,
            )
            results.append({"condition": asdict(condition), "metrics": summarize(json.loads(output), samples)})
    finally:
        cleanup(runner, network, broker)
    return {"schemaVersion": "gcs-saker.mqtt-netem-fixture.v1", "project": project, "results": results}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--deployment-target", required=True)
    parser.add_argument("--samples", type=int, default=30)
    args = parser.parse_args()
    try:
        validate(args.project, args.deployment_target, args.samples)
        root = Path(__file__).resolve().parents[2]
        print(json.dumps(execute(root, args.project, args.samples, SubprocessRunner()), separators=(",", ":")))
        return 0
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "BLOCKED", "errorCode": type(exc).__name__}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
