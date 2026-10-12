#!/usr/bin/env python3
"""Require bounded REST, gRPC, protobuf, and MQTT security campaigns."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

REQUIRED_EVIDENCE = {
    "auth-rate-limit": (
        ROOT / "services/auth-policy/src/test/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/RequestSecurityFiltersTest.kt",
        ("rate limit filter rejects repeated auth requests", "RETRY_AFTER_HEADER"),
    ),
    "rest-dast": (
        ROOT / "scripts/smoke/auth_boundary_dast.py",
        (
            "playback_idor_unauthenticated",
            "login_untrusted_origin",
            "login_missing_csrf",
            "stream_invalid_bearer",
            "login_oversized",
            "FORBIDDEN_RESPONSE_MARKERS",
        ),
    ),
    "media-token-boundary": (
        ROOT / "services/media-control/internal/httpapi/media_auth_test.go",
        ("RejectsCrossActionAndDuplicateTokens", "RejectsUnknownActionAndOversizedBody"),
    ),
    "publish-session-rate-limit": (
        ROOT / "services/media-control/internal/httpapi/request_rate_limit_test.go",
        ("BoundsKeysAndRecoversAfterWindow", "UsesHashedSubjectAndReturns429"),
    ),
    "grpc-boundary": (
        ROOT / "services/media-control/internal/grpcgateway/server_test.go",
        (
            "reasonMalformed",
            "reasonBackpressure",
            "reasonIdentityMismatch",
            "TestExchangeTransportRejectsExtremePayloadBeforeHandler",
            "TestExchangeRejectsUnknownAndUnspecifiedEnumValues",
        ),
    ),
    "grpc-fuzz": (
        ROOT / "services/media-control/internal/grpcgateway/auth_fuzz_test.go",
        ("FuzzGatewayMetadata",),
    ),
    "mqtt-boundary": (
        ROOT / "services/media-control/internal/mqttgateway/message_test.go",
        (
            "MalformedAndOversized",
            "UnknownProtobufFieldsNeverReachGateway",
            "gcs/device/+/+/telemetry",
            "invalid payload reached gateway",
        ),
    ),
    "mqtt-lifecycle-boundary": (
        ROOT / "services/media-control/internal/mqttgateway/bridge_test.go",
        ("TestConsumerFailsClosedWhenIngressQueueCloses", "TestConsumerStopsOnCancellationOrConnectionLoss"),
    ),
    "mqtt-backpressure-boundary": (
        ROOT / "services/media-control/internal/mqttgateway/partition_consumer_test.go",
        ("TestConsumerCancellationStopsSaturatedPartition", "TestEnqueueBackpressureLeavesQoSMessageUnacknowledged"),
    ),
    "mqtt-fuzz": (
        ROOT / "services/media-control/internal/mqttgateway/message_fuzz_test.go",
        ("FuzzSessionFromTopic",),
    ),
    "token-fuzz": (
        ROOT / "services/media-control/internal/sessiontoken/token_fuzz_test.go",
        ("FuzzValidateForRoute",),
    ),
    "websocket-resource-boundary": (
        ROOT / "services/auth-policy/src/test/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/TelemetryWebSocketHubTest.kt",
        (
            "system administrator is rejected",
            "bounds global and per principal connection counts",
            "records queue and backpressure metrics",
        ),
    ),
    "sse-resource-boundary": (
        ROOT
        / "services/auth-policy/src/test/kotlin/kr/co/a4ai/gcssaker/authpolicy/configuration/streaming/MvcStreamingConfigTest.kt",
        ("bounded workers and queue capacity", "remainingCapacity"),
    ),
}


def verify_campaigns() -> dict[str, str]:
    results: dict[str, str] = {}
    for name, (path, markers) in REQUIRED_EVIDENCE.items():
        if not path.is_file():
            raise ValueError(f"security campaign source is missing: {name}")
        source = path.read_text(encoding="utf-8")
        if any(marker not in source for marker in markers):
            raise ValueError(f"security campaign evidence is incomplete: {name}")
        results[name] = "PASS"
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        raise SystemExit("--check is required")
    campaigns = verify_campaigns()
    print(json.dumps({"schemaVersion": "gcs-saker.security-campaign.v1", "campaigns": campaigns}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
