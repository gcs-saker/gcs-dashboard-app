from __future__ import annotations

import json
import struct
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.protocol_v2.stream_control import StreamCommandPayload  # noqa: E402

SAMPLE_TELEMETRY: dict[str, Any] = {
    "event_id": "evt-20260618-0001",
    "org_id": "a4ai",
    "group_id": "battalion-alpha",
    "asset_id": "drn-001",
    "asset_kind": 1,
    "observed_unix_millis": 1_781_721_600_000,
    "received_unix_millis": 1_781_721_600_042,
    "latitude": 35.871435,
    "longitude": 128.601445,
    "altitude_m": 120.5,
    "heading_deg": 7.2,
    "speed_mps": 10.0,
    "battery_percent": 78.0,
    "health": 1,
    "active_stream_ids": ["stream-main", "stream-thermal"],
}


@dataclass(frozen=True)
class BenchmarkResult:
    iterations: int
    json_bytes: int
    protobuf_bytes: int
    json_encode_ms: float
    json_decode_ms: float
    protobuf_encode_ms: float
    protobuf_decode_ms: float

    @property
    def size_reduction_percent(self) -> float:
        return (1 - self.protobuf_bytes / self.json_bytes) * 100

    @property
    def encode_speedup_percent(self) -> float:
        if self.protobuf_encode_ms == 0:
            return 0
        return (self.json_encode_ms / self.protobuf_encode_ms - 1) * 100

    @property
    def decode_speedup_percent(self) -> float:
        if self.protobuf_decode_ms == 0:
            return 0
        return (self.json_decode_ms / self.protobuf_decode_ms - 1) * 100


def run_benchmark(iterations: int = 20_000) -> BenchmarkResult:
    json_payload = encode_json(SAMPLE_TELEMETRY)
    protobuf_payload = encode_proto_like_telemetry(SAMPLE_TELEMETRY)

    json_encode_ms = measure_ms(iterations, lambda: encode_json(SAMPLE_TELEMETRY))
    json_decode_ms = measure_ms(iterations, lambda: json.loads(json_payload))
    protobuf_encode_ms = measure_ms(iterations, lambda: encode_proto_like_telemetry(SAMPLE_TELEMETRY))
    protobuf_decode_ms = measure_ms(iterations, lambda: decode_proto_like_telemetry(protobuf_payload))

    return BenchmarkResult(
        iterations=iterations,
        json_bytes=len(json_payload),
        protobuf_bytes=len(protobuf_payload),
        json_encode_ms=json_encode_ms,
        json_decode_ms=json_decode_ms,
        protobuf_encode_ms=protobuf_encode_ms,
        protobuf_decode_ms=protobuf_decode_ms,
    )


def encode_json(sample: dict[str, Any]) -> bytes:
    return json.dumps(sample, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def encode_proto_like_telemetry(sample: dict[str, Any]) -> bytes:
    payload = bytearray()
    write_string(payload, 1, sample["event_id"])
    write_string(payload, 2, sample["org_id"])
    write_string(payload, 3, sample["group_id"])
    write_string(payload, 4, sample["asset_id"])
    write_varint_field(payload, 5, sample["asset_kind"])
    write_varint_field(payload, 6, sample["observed_unix_millis"])
    write_varint_field(payload, 7, sample["received_unix_millis"])
    write_double(payload, 8, sample["latitude"])
    write_double(payload, 9, sample["longitude"])
    write_double(payload, 10, sample["altitude_m"])
    write_double(payload, 11, sample["heading_deg"])
    write_double(payload, 12, sample["speed_mps"])
    write_double(payload, 13, sample["battery_percent"])
    write_varint_field(payload, 14, sample["health"])
    for stream_id in sample["active_stream_ids"]:
        write_string(payload, 15, stream_id)
    return bytes(payload)


def decode_proto_like_telemetry(payload: bytes) -> dict[int, list[Any]]:
    cursor = 0
    decoded: dict[int, list[Any]] = {}
    while cursor < len(payload):
        key, cursor = read_varint(payload, cursor)
        field_number = key >> 3
        wire_type = key & 0b111
        value: Any
        if wire_type == 0:
            value, cursor = read_varint(payload, cursor)
        elif wire_type == 1:
            value = struct.unpack("<d", payload[cursor : cursor + 8])[0]
            cursor += 8
        elif wire_type == 2:
            length, cursor = read_varint(payload, cursor)
            value = payload[cursor : cursor + length].decode("utf-8")
            cursor += length
        else:
            raise ValueError(f"unsupported wire type: {wire_type}")
        decoded.setdefault(field_number, []).append(value)
    return decoded


def write_string(payload: bytearray, field_number: int, value: str) -> None:
    encoded = value.encode("utf-8")
    write_varint(payload, (field_number << 3) | 2)
    write_varint(payload, len(encoded))
    payload.extend(encoded)


def write_double(payload: bytearray, field_number: int, value: float) -> None:
    write_varint(payload, (field_number << 3) | 1)
    payload.extend(struct.pack("<d", value))


def write_varint_field(payload: bytearray, field_number: int, value: int) -> None:
    write_varint(payload, (field_number << 3) | 0)
    write_varint(payload, value)


def write_varint(payload: bytearray, value: int) -> None:
    while value > 0x7F:
        payload.append((value & 0x7F) | 0x80)
        value >>= 7
    payload.append(value)


def read_varint(payload: bytes, cursor: int) -> tuple[int, int]:
    shift = 0
    result = 0
    while True:
        byte = payload[cursor]
        cursor += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, cursor
        shift += 7


def measure_ms(iterations: int, action: Any) -> float:
    started = time.perf_counter()
    for _ in range(iterations):
        action()
    return (time.perf_counter() - started) * 1000


def main() -> None:
    result = run_benchmark()
    command_result = run_stream_command_benchmark()
    print(f"iterations={result.iterations}")
    print(f"json_bytes={result.json_bytes}")
    print(f"protobuf_wire_bytes={result.protobuf_bytes}")
    print(f"size_reduction_percent={result.size_reduction_percent:.2f}")
    print(f"json_encode_ms={result.json_encode_ms:.2f}")
    print(f"protobuf_wire_encode_ms={result.protobuf_encode_ms:.2f}")
    print(f"encode_speedup_percent={result.encode_speedup_percent:.2f}")
    print(f"json_decode_ms={result.json_decode_ms:.2f}")
    print(f"protobuf_wire_decode_ms={result.protobuf_decode_ms:.2f}")
    print(f"decode_speedup_percent={result.decode_speedup_percent:.2f}")
    print(f"stream_command_json_bytes={command_result.json_bytes}")
    print(f"stream_command_protobuf_wire_bytes={command_result.protobuf_bytes}")
    print(f"stream_command_size_reduction_percent={command_result.size_reduction_percent:.2f}")


def run_stream_command_benchmark(iterations: int = 20_000) -> BenchmarkResult:
    command = StreamCommandPayload(
        command_id="cmd-20260618-0001",
        stream_id="raw.mobile.front",
        target_asset_id="CID001",
        command_type="stop",
        observed_unix_millis=1_781_721_600_000,
    )
    json_payload = encode_json(
        {
            "command_id": command.command_id,
            "stream_id": command.stream_id,
            "target_asset_id": command.target_asset_id,
            "command_type": command.command_type,
            "observed_unix_millis": command.observed_unix_millis,
        }
    )
    protobuf_payload = command.to_protobuf_wire()

    json_encode_ms = measure_ms(
        iterations,
        lambda: encode_json(
            {
                "command_id": command.command_id,
                "stream_id": command.stream_id,
                "target_asset_id": command.target_asset_id,
                "command_type": command.command_type,
                "observed_unix_millis": command.observed_unix_millis,
            }
        ),
    )
    json_decode_ms = measure_ms(iterations, lambda: json.loads(json_payload))
    protobuf_encode_ms = measure_ms(iterations, command.to_protobuf_wire)
    protobuf_decode_ms = measure_ms(iterations, lambda: StreamCommandPayload.from_protobuf_wire(protobuf_payload))

    return BenchmarkResult(
        iterations=iterations,
        json_bytes=len(json_payload),
        protobuf_bytes=len(protobuf_payload),
        json_encode_ms=json_encode_ms,
        json_decode_ms=json_decode_ms,
        protobuf_encode_ms=protobuf_encode_ms,
        protobuf_decode_ms=protobuf_decode_ms,
    )


if __name__ == "__main__":
    main()
