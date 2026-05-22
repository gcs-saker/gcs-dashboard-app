import asyncio

from fastapi import HTTPException
import pytest

from api.stream import router as stream_router
from modules.streaming import (
    DEFAULT_STREAM_SEEDS,
    InMemoryStreamRepository,
    PlaybackUrlBuilder,
    PlaybackUrlBuilderConfig,
    StreamDescriptor,
    StreamSeed,
    StreamingService,
    validate_stream_status,
)
import modules.streaming.router as streaming_router_module
from modules.streaming.router import (
    get_playback_urls,
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


def test_default_streaming_service_seeds_m1_sample_streams():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    service = StreamingService(playback_url_builder=builder)

    streams = service.list_registered_streams()
    stream_ids = {stream.stream_id for stream in streams}

    assert len(DEFAULT_STREAM_SEEDS) == 3
    assert "raw.sample.front" in stream_ids
    assert {stream.status for stream in streams} == {"online", "offline", "unknown"}
    assert service.module_status().registered_streams == 3


def test_sample_front_seed_has_consistent_stream_contract():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    service = StreamingService(playback_url_builder=builder)

    descriptor = service.get_registered_stream("raw.sample.front")

    assert descriptor is not None
    assert descriptor.stream_id == "raw.sample.front"
    assert descriptor.path == "raw/sample/front"
    assert descriptor.stream_path.asset_id == "sample"
    assert descriptor.stream_path.sensor_id == "front"
    assert descriptor.status == "online"
    assert descriptor.display_name == "Sample Front Camera"
    assert descriptor.playback_urls.webrtc == "https://media.example.com/webrtc/raw/sample/front/whep"
    assert descriptor.playback_urls.hls == "https://media.example.com/hls/raw/sample/front/index.m3u8"


def test_stream_seed_can_be_used_for_isolated_poc_registry():
    builder = PlaybackUrlBuilder()
    seed = StreamSeed(
        path="raw/sample/front",
        status="online",
        display_name="Sample Front Camera",
    )

    descriptor = seed.to_descriptor(builder)

    assert descriptor.stream_id == "raw.sample.front"
    assert descriptor.path == "raw/sample/front"
    assert descriptor.status == "online"
    assert descriptor.playback_urls.has_playback_url is False


@pytest.mark.parametrize("status", ["registered", "online", "offline", "unknown"])
def test_stream_status_values_are_validated(status):
    assert validate_stream_status(status) == status


def test_stream_status_rejects_unknown_runtime_value():
    with pytest.raises(ValueError) as exc_info:
        StreamDescriptor.from_path("raw/sample/front", status="maintenance")  # type: ignore[arg-type]

    assert str(exc_info.value) == "stream status must be one of registered, online, offline, unknown"


def test_service_registers_stream_path_and_builds_mediamtx_playback_urls():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            webrtc_base_url="http://mediamtx.local:8889",
            hls_base_url="http://mediamtx.local:8888",
        )
    )
    service = StreamingService(
        repository=InMemoryStreamRepository(),
        playback_url_builder=builder,
    )

    descriptor = service.register_stream_path(
        "raw/robot-001/front",
        status="online",
        display_name="Robot 001 Front",
    )

    assert descriptor.stream_id == "raw.robot-001.front"
    assert descriptor.status == "online"
    assert descriptor.playback_urls.webrtc == "http://mediamtx.local:8889/raw/robot-001/front/whep"
    assert descriptor.playback_urls.hls == "http://mediamtx.local:8888/raw/robot-001/front/index.m3u8"
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
    assert "/module/playback/{stream_id}" in route_paths
    assert "/module/registry" in route_paths
    assert "/module/registry/{stream_id}" in route_paths


def test_streaming_module_status_router_returns_testable_payload():
    response = run_async(get_streaming_module_status())

    assert response.model_dump(by_alias=True) == {
        "registryReady": True,
        "playbackUrlBuilderReady": True,
        "registeredStreams": 3,
    }


def test_streaming_module_playback_router_returns_env_backed_urls(monkeypatch):
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    service = StreamingService(playback_url_builder=builder)
    monkeypatch.setattr(streaming_router_module, "default_streaming_service", service)

    response = run_async(get_playback_urls("raw.sample.front"))

    assert response.model_dump() == {
        "webrtc": "https://media.example.com/webrtc/raw/sample/front/whep",
        "hls": "https://media.example.com/hls/raw/sample/front/index.m3u8",
    }


def test_streaming_module_playback_router_returns_422_for_invalid_stream_id(monkeypatch):
    service = StreamingService(playback_url_builder=PlaybackUrlBuilder())
    monkeypatch.setattr(streaming_router_module, "default_streaming_service", service)

    with pytest.raises(HTTPException) as exc_info:
        run_async(get_playback_urls("bad"))

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "stream path prefix must be one of raw, ai, archive"


def test_streaming_module_registry_router_returns_seed_streams():
    response = run_async(list_stream_registry())

    assert [stream.stream_id for stream in response] == [
        "raw.sample.front",
        "raw.sample.thermal",
        "raw.sample.rear",
    ]


def test_streaming_module_registry_router_returns_sample_front_seed():
    response = run_async(get_stream_registry_item("raw.sample.front"))

    assert response.model_dump(by_alias=True) == {
        "streamId": "raw.sample.front",
        "path": "raw/sample/front",
        "prefix": "raw",
        "assetId": "sample",
        "sensorId": "front",
        "processorId": None,
        "date": None,
        "status": "online",
        "displayName": "Sample Front Camera",
        "playbackUrls": {"webrtc": None, "hls": None},
    }


@pytest.mark.parametrize("stream_id", ["raw.robot-001.front", "ai.drone-01.front.detector-v1"])
def test_streaming_module_registry_router_returns_404_for_missing_stream(stream_id):
    with pytest.raises(HTTPException) as exc_info:
        run_async(get_stream_registry_item(stream_id))

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "stream is not registered"
