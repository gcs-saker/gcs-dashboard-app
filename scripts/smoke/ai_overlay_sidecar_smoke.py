#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from modules.ai_contract import AI_CONTRACT_SCHEMA_VERSION, AIEndpointRequest, MockAIService  # noqa: E402
from modules.protocol_v2.ai_overlay import (  # noqa: E402
    AiOverlayEventPayload,
    dashboard_response_from_overlay_events,
    events_from_dashboard_response,
)


SCHEMA_VERSION = "ai-overlay-sidecar-smoke-v1"
STREAM_ID = "raw.sample.front"
FRAME_ID = "frame-0001"
CAPTURED_AT = "2026-05-22T08:00:00Z"
GENERATED_AT = datetime(2026, 5, 22, 8, 0, 1, tzinfo=timezone.utc)


def build_request() -> AIEndpointRequest:
    return AIEndpointRequest.model_validate(
        {
            "schemaVersion": AI_CONTRACT_SCHEMA_VERSION,
            "streamId": STREAM_ID,
            "frame": {
                "streamId": STREAM_ID,
                "frameId": FRAME_ID,
                "capturedAt": CAPTURED_AT,
                "ptsMs": 1200,
            },
            "imageUrl": "https://media.example.test/raw/sample/front/frame-0001.jpg",
        }
    )


async def run_mock_overlay_smoke() -> dict[str, Any]:
    service = MockAIService(generated_at=GENERATED_AT)
    ai_response = await service.detect(build_request())
    events = events_from_dashboard_response(ai_response)
    decoded_events = tuple(AiOverlayEventPayload.from_protobuf_wire(event.to_protobuf_wire()) for event in events)
    restored_response = dashboard_response_from_overlay_events(
        stream_id=ai_response.stream_id,
        frame=ai_response.frame,
        generated_at=ai_response.generated_at,
        events=decoded_events,
        risk_score=ai_response.risk_score,
        report_text=ai_response.report_text,
    )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "streamId": ai_response.stream_id,
        "eventCount": len(decoded_events),
        "protobufBytes": sum(len(event.to_protobuf_wire()) for event in decoded_events),
        "mediaPath": "not-carried-by-ai-sidecar",
        "dashboardDtoFields": sorted(restored_response.model_dump(by_alias=True).keys()),
        "firstEvent": {
            "eventId": decoded_events[0].event_id if decoded_events else None,
            "modelId": decoded_events[0].model_id if decoded_events else None,
            "label": decoded_events[0].label if decoded_events else None,
            "observedUnixMillis": decoded_events[0].observed_unix_millis if decoded_events else None,
            "receivedUnixMillis": decoded_events[0].received_unix_millis if decoded_events else None,
        },
    }


def build_check_report() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "contract": [
            "mock AI detection returns dashboard JSON DTO",
            "dashboard detection converts to AiOverlayEvent protobuf",
            "AiOverlayEvent protobuf converts back to dashboard DTO",
            "AI sidecar carries overlay metadata only, not media frames",
        ],
        "streamId": STREAM_ID,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate mock AI overlay sidecar metadata path.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Print the stable smoke contract.")
    mode.add_argument("--run", action="store_true", help="Run the in-process mock sidecar smoke.")
    args = parser.parse_args()
    if not args.check and not args.run:
        args.check = True
    return args


def main() -> int:
    args = parse_args()
    payload = build_check_report() if args.check else asyncio.run(run_mock_overlay_smoke())
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
