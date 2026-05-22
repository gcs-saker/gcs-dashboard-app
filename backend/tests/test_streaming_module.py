import asyncio

from fastapi import HTTPException
import pytest

from api.stream import router as stream_router
from modules.streaming import (
    InMemoryStreamRepository,
    PlaybackUrlBuilder,
    PlaybackUrlBuilderConfig,
    StreamDescriptor,
    StreamingService,
)
from modules.streaming.router import (
    get_stream_registry_item,
    get_streaming_module_status,
    list_stream_registry,
)
from modules.streaming.schemas import StreamDescriptorResponse


def run_async(coro):
    return asyncio.run(coro)


def test_streaming_module_imports_core_boundaries():
    repository = InMemoryStreamRepository()
    builder = PlaybackUrlBuilder()
    service = StreamingService(repository=repository, playback_url_builder=builder)

    assert service.module_status().registry_ready is True
    assert service.module_status().playback_url_builder_ready is True
    assert service.list_registered_streams() == []


def test_service_registers_stream_path_and_builds_placeholder_playback_urls():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            webrtc_base_url="http://mediamtx.local:8889",
            hls_base_url="http://mediamtx.local:8888",
        )
    )
    service = StreamingService(playback_url_builder=builder)

    descriptor = service.register_stream_path(
        "raw/robot-001/front",
        status="online",
        display_name="Robot 001 Front",
    )

    assert descriptor.stream_id == "raw.robot-001.front"
    assert descriptor.status == "online"
    assert descriptor.playback_urls.webrtc == "http://mediamtx.local:8889/raw/robot-001/front"
    assert descriptor.playback_urls.hls == "http://mediamtx.local:8888/raw/robot-001/front"
    assert service.get_registered_stream("raw.robot-001.front") == descriptor
    assert service.module_status().registered_streams == 1


def test_repository_can_be_seeded_for_future_stream_registry():
    descriptor = StreamDescriptor.from_path("ai/drone-01/front/detector-v1")
    repository = InMemoryStreamRepository([descriptor])

    assert repository.list() == [descriptor]
    assert repository.get("ai.drone-01.front.detector-v1") == descriptor
    assert repository.get("raw.missing.front") is None


def test_stream_descriptor_response_uses_frontend_friendly_aliases():
    descriptor = StreamDescriptor.from_path("archive/ugv-02/rear/2026-05-22")
    response = StreamDescriptorResponse.from_domain(descriptor)

    assert response.model_dump(by_alias=True) == {
        "streamId": "archive.ugv-02.rear.2026-05-22",
        "path": "archive/ugv-02/rear/2026-05-22",
        "prefix": "archive",
        "assetId": "ugv-02",
        "sensorId": "rear",
        "processorId": None,
        "date": "2026-05-22",
        "status": "registered",
        "displayName": None,
        "playbackUrls": {"webrtc": None, "hls": None},
    }


def test_streaming_module_router_boundary_is_mounted_under_stream_api():
    route_paths = {route.path for route in stream_router.routes}

    assert "/module/status" in route_paths
    assert "/module/registry" in route_paths
    assert "/module/registry/{stream_id}" in route_paths


def test_streaming_module_status_router_returns_testable_payload():
    response = run_async(get_streaming_module_status())

    assert response.model_dump(by_alias=True) == {
        "registryReady": True,
        "playbackUrlBuilderReady": True,
        "registeredStreams": 0,
    }


def test_streaming_module_registry_router_starts_empty():
    assert run_async(list_stream_registry()) == []


@pytest.mark.parametrize("stream_id", ["raw.robot-001.front", "ai.drone-01.front.detector-v1"])
def test_streaming_module_registry_router_returns_404_for_missing_stream(stream_id):
    with pytest.raises(HTTPException) as exc_info:
        run_async(get_stream_registry_item(stream_id))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "stream is not registered"
