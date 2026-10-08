import asyncio
from collections.abc import Callable

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from modules.ai_adapter.router import AIAnalysisRequest, ai_adapter_status, analyze_stream


def test_ai_request_rejects_client_supplied_group() -> None:
    with pytest.raises(ValueError):
        AIAnalysisRequest.model_validate({"streamId": "raw.robot.front", "processorId": "detector", "groupId": "co-b"})


def test_ai_route_fails_closed_until_server_binding_exists() -> None:
    request = AIAnalysisRequest.model_validate({"streamId": "raw.robot.front", "processorId": "detector"})

    with pytest.raises(HTTPException) as error:
        asyncio.run(analyze_stream(request, object(), object()))  # type: ignore[arg-type]

    assert error.value.status_code == 503
    assert error.value.detail == "AI stream binding resolver is not configured"


def test_ai_status_reports_contract_without_exposing_processor_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "AI_PROCESSOR_ENDPOINTS_JSON",
        '{"detector-b":"https://secret-b.internal/detect","detector-a":"https://secret-a.internal/detect"}',
    )

    response = ai_adapter_status().model_dump(by_alias=True)

    assert response == {
        "configured": True,
        "processorIds": ["detector-a", "detector-b"],
        "contractVersion": "ai.detection.v1alpha1",
    }
    assert "internal" not in str(response)


def test_ai_status_reports_unconfigured_without_inventing_a_processor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_PROCESSOR_ENDPOINTS_JSON", "{}")

    response = ai_adapter_status()

    assert response.configured is False
    assert response.processor_ids == []


def test_ai_status_uses_existing_admin_authentication_and_role_policy(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    with TestClient(app) as client:
        missing = client.get("/api/v1/ai/status")
        operator = client.get("/api/v1/ai/status", headers=auth_headers("operator01", "operator"))
        admin = client.get("/api/v1/ai/status", headers=auth_headers("admin01", "admin"))

    assert missing.status_code == 401
    assert operator.status_code == 403
    assert admin.status_code == 200
