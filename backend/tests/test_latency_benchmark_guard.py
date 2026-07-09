from __future__ import annotations

from typing import Any

import httpx
import pytest
import respx

from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
from modules.protocol_v2.telemetry_contract import AssetKinds, HealthStates
from modules.streaming.mediamtx_client import MediaMTXApiRoutes, MediaMTXClient

MEDIAMTX_BASE_URL = "https://mediamtx.benchmark.test"


def benchmark_telemetry_payload() -> TelemetryEnvelopePayload:
    return TelemetryEnvelopePayload(
        event_id="bench-event-001",
        org_id="a4ai",
        group_id="ops",
        asset_id="drone-001",
        asset_kind=AssetKinds.DRONE,
        observed_unix_millis=1_782_500_400_000,
        received_unix_millis=1_782_500_400_050,
        latitude=35.8714,
        longitude=128.6014,
        altitude_m=120.5,
        heading_deg=181.25,
        speed_mps=14.2,
        battery_percent=78.5,
        health=HealthStates.OK,
        active_stream_ids=("raw.drone-001.front",),
    )


@pytest.mark.benchmark
def test_telemetry_protobuf_roundtrip_latency_guard(benchmark: Any) -> None:
    payload = benchmark_telemetry_payload()

    def roundtrip() -> TelemetryEnvelopePayload:
        return TelemetryEnvelopePayload.from_protobuf_wire(payload.to_protobuf_wire())

    decoded = benchmark(roundtrip)

    assert decoded == payload


@pytest.mark.benchmark
@respx.mock
def test_mediamtx_http_client_wrapper_latency_guard(benchmark: Any) -> None:
    respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {"name": "raw/drone-001/front", "ready": True, "source": {"type": "rtspSession"}, "readers": []},
                    {"name": "raw/drone-002/front", "ready": True, "source": {"type": "webRTCSession"}, "readers": []},
                ]
            },
        )
    )
    client = MediaMTXClient(MEDIAMTX_BASE_URL)

    paths = benchmark(client.list_paths)

    assert [path.name for path in paths] == ["raw/drone-001/front", "raw/drone-002/front"]
