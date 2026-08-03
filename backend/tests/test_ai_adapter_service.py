import asyncio
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.db import Base
from modules.ai_adapter.models import AIResultEvent
from modules.ai_adapter.service import AIAdapterService, AIProcessorNotFoundError, AIProcessorUnavailableError
from modules.ai_adapter.settings import AIAdapterSettings


def settings() -> AIAdapterSettings:
    return AIAdapterSettings(
        AI_PROCESSOR_ENDPOINTS_JSON='{"detector":"https://ai.example.test/detect"}',
        AI_STREAM_BASE_URL="https://media.internal.test",
        AI_ADAPTER_TIMEOUT_SECONDS=1.0,
    )


def response_payload() -> dict[str, object]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schemaVersion": "ai.detection.v1alpha1",
        "streamId": "raw.robot.front",
        "frame": {"streamId": "raw.robot.front", "capturedAt": now},
        "generatedAt": now,
        "riskScore": 0.4,
        "reportText": "object detected",
        "detections": [],
    }


def test_adapter_sends_server_derived_stream_url_and_persists_result() -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(200, json=response_payload())

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    async def run() -> object:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await AIAdapterService(settings(), client).analyze(
                session, "raw.robot.front", "detector", "co-a"
            )

    result = asyncio.run(run())

    assert captured["imageUrl"] == "https://media.internal.test/raw.robot.front/whep"
    assert result.stream_id == "raw.robot.front"
    stored = session.query(AIResultEvent).one()
    assert stored.processor_id == "detector"
    assert "object detected" in stored.payload_json


def test_adapter_rejects_unknown_processor_without_outbound_request() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    with pytest.raises(AIProcessorNotFoundError):
        asyncio.run(AIAdapterService(settings()).analyze(session, "raw.robot.front", "missing", "co-a"))


def test_adapter_maps_timeout_without_affecting_media_stream() -> None:
    async def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out")

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as client:
            await AIAdapterService(settings(), client).analyze(
                session, "raw.robot.front", "detector", "co-a"
            )

    with pytest.raises(AIProcessorUnavailableError):
        asyncio.run(run())


def test_adapter_rejects_noncanonical_stream_id() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    with pytest.raises(ValueError, match="canonical stream path"):
        asyncio.run(AIAdapterService(settings()).analyze(session, "../secret", "detector", "co-a"))

    assert session.query(AIResultEvent).count() == 0
