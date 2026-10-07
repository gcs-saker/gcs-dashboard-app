import asyncio
import inspect
from threading import Event

import httpx
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import api.telemetry as telemetry_api
from api.control import control_robot
from api.health import readyz
from api.stream import get_stream, get_stream_playback, get_stream_status, list_streams
from api.unmaned_assets import get_asset
from main import create_app
from model.telemetry_model import TelemetryResponse
from modules.streaming.router import get_stream_registry_item, get_streaming_module_status, list_stream_registry
from modules.telemetry_ingest import TelemetryIngestCommand

BLOCKING_ENDPOINTS = (
    telemetry_api.receive_telemetry,
    get_asset,
    control_robot,
    readyz,
    list_streams,
    get_stream_playback,
    get_stream_status,
    get_stream,
    get_streaming_module_status,
    list_stream_registry,
    get_stream_registry_item,
)


def test_blocking_io_endpoints_use_fastapi_thread_pool_boundary() -> None:
    assert all(not inspect.iscoroutinefunction(endpoint) for endpoint in BLOCKING_ENDPOINTS)


def test_blocking_telemetry_write_does_not_stall_event_loop(monkeypatch) -> None:
    started = Event()
    release = Event()

    def blocking_write(command: TelemetryIngestCommand, db: Session) -> TelemetryResponse:
        del command, db
        started.set()
        release.wait(timeout=2)
        return TelemetryResponse(uuid="threaded-device")

    monkeypatch.setattr(telemetry_api, "upsert_telemetry", blocking_write)

    async def exercise() -> None:
        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            write_task = asyncio.create_task(client.post("/telemetry/", json={"uuid": "threaded-device"}))
            assert await asyncio.to_thread(started.wait, 1)
            health = await asyncio.wait_for(client.get("/healthz"), timeout=0.5)
            release.set()
            response = await asyncio.wait_for(write_task, timeout=1)
        assert health.status_code == 200
        assert response.status_code == 200

    try:
        asyncio.run(exercise())
    finally:
        release.set()


def test_blocking_db_failure_remains_an_http_failure(monkeypatch) -> None:
    def failed_write(command: TelemetryIngestCommand, db: Session) -> TelemetryResponse:
        del command, db
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(telemetry_api, "upsert_telemetry", failed_write)
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        response = client.post("/telemetry/", json={"uuid": "failed-device"})

    assert response.status_code == 500
