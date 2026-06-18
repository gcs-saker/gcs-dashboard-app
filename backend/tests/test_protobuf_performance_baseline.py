from __future__ import annotations

from scripts.protobuf_contract_benchmark import run_benchmark, run_stream_command_benchmark


def test_protobuf_wire_baseline_is_smaller_than_json() -> None:
    result = run_benchmark(iterations=2000)

    assert result.protobuf_bytes < result.json_bytes
    assert result.size_reduction_percent >= 30


def test_stream_command_protobuf_wire_baseline_is_smaller_than_json() -> None:
    result = run_stream_command_benchmark(iterations=2000)

    assert result.protobuf_bytes < result.json_bytes
    assert result.size_reduction_percent >= 30
