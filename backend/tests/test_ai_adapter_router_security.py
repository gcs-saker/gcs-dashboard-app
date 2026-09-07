import asyncio

import pytest
from fastapi import HTTPException

from modules.ai_adapter.router import AIAnalysisRequest, analyze_stream


def test_ai_request_rejects_client_supplied_group() -> None:
    with pytest.raises(ValueError):
        AIAnalysisRequest.model_validate({"streamId": "raw.robot.front", "processorId": "detector", "groupId": "co-b"})


def test_ai_route_fails_closed_until_server_binding_exists() -> None:
    request = AIAnalysisRequest.model_validate({"streamId": "raw.robot.front", "processorId": "detector"})

    with pytest.raises(HTTPException) as error:
        asyncio.run(analyze_stream(request, object(), object()))  # type: ignore[arg-type]

    assert error.value.status_code == 503
    assert error.value.detail == "AI stream binding resolver is not configured"
