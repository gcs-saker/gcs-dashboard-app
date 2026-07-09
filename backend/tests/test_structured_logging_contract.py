from __future__ import annotations

import json
from io import StringIO

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from core.structured_logging import (
    REDACTED_VALUE,
    StructuredLoggingSettings,
    configure_structured_logging,
    get_logger,
    log_request_failed,
    sanitize_mapping,
)


def test_structured_log_redacts_sensitive_fields() -> None:
    event = {
        "event": "security_check",
        "password": "must-not-appear",
        "metadata": {
            "access_token": "must-not-appear",
            "stream_id": "raw.sample.front",
        },
        "media_payload": "must-not-appear",
    }

    sanitized = sanitize_mapping(event)

    assert sanitized["password"] == REDACTED_VALUE
    assert sanitized["metadata"]["access_token"] == REDACTED_VALUE
    assert sanitized["metadata"]["stream_id"] == "raw.sample.front"
    assert sanitized["media_payload"] == REDACTED_VALUE
    assert "must-not-appear" not in str(sanitized)


def test_endpoint_error_writes_json_log_contract() -> None:
    output = StringIO()
    configure_structured_logging(
        StructuredLoggingSettings(enabled=True),
        output=output,
    )
    logger = get_logger("test-api")
    app = FastAPI()

    @app.middleware("http")
    async def error_logging_middleware(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            log_request_failed(logger, request, exc)
            raise

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("token must-not-appear")

    response = TestClient(app, raise_server_exceptions=False).get(
        "/boom?token=must-not-appear",
        headers={"Authorization": "Bearer must-not-appear"},
    )

    payload = json.loads(output.getvalue().splitlines()[-1])

    assert response.status_code == 500
    assert payload["event"] == "http_request_failed"
    assert payload["severity"] == "error"
    assert payload["component"] == "test-api"
    assert payload["http_method"] == "GET"
    assert payload["http_route"] == "/boom"
    assert payload["error_type"] == "RuntimeError"
    assert "must-not-appear" not in json.dumps(payload)
