import asyncio
from typing import Any, cast

from fastapi import HTTPException
import pytest
from starlette.routing import Route

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
from modules.streaming.mediamtx_client import MediaMTXClient, MediaMTXPath
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

    assert len(DEFAULT_STREAM_SEEDS) == 4
    assert "raw.sample.front" in stream_ids
    assert "raw.local.webcam" in stream_ids
    assert {stream.status for stream in streams} == {"registered", "online", "offline", "unknown"}
    assert service.module_status().registered_streams == 4


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
    runtime_status = cast(Any, "maintenance")

    with pytest.raises(ValueError) as exc_info:
        StreamDescriptor.from_path("raw/sample/front", status=runtime_status)

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


def test_service_discovers_ready_mediamtx_paths_and_overrides_seed_status():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    mediamtx_client = cast(
        MediaMTXClient,
        FakeMediaMTXClient(
            [
                MediaMTXPath(name="raw/local/webcam", ready=True, source_type="webRTCSession", reader_count=1),
                MediaMTXPath(name="raw/drone-07/front", ready=True, source_type="rtspSession", reader_count=0),
            ]
        ),
    )
    service = StreamingService(playback_url_builder=builder, mediamtx_client=mediamtx_client)

    streams = {stream.stream_id: stream for stream in service.list_registered_streams()}

    assert streams["raw.local.webcam"].status == "online"
    assert streams["raw.local.webcam"].display_name == "raw/local/webcam (webRTCSession, readers 1)"
    assert streams["raw.drone-07.front"].status == "online"
    assert streams["raw.drone-07.front"].playback_urls.webrtc == (
        "https://media.example.com/webrtc/raw/drone-07/front/whep"
    )
    assert service.get_registered_stream("raw.drone-07.front") == streams["raw.drone-07.front"]


def test_service_ignores_mediamtx_paths_that_do_not_match_stream_contract():
    mediamtx_client = cast(
        MediaMTXClient,
        FakeMediaMTXClient([MediaMTXPath(name="camera1", ready=True)]),
    )
    service = StreamingService(
        repository=InMemoryStreamRepository(),
        playback_url_builder=PlaybackUrlBuilder(),
        mediamtx_client=mediamtx_client,
    )

    assert service.list_registered_streams() == []


def test_repository_can_be_seeded_for_future_stream_registry():
    descriptor = StreamDescriptor.from_path("ai/drone-01/front/detector-v1")
    repository = InMemoryStreamRepository([descriptor])

    assert repository.list() == [descriptor]
    assert repository.get("ai.drone-01.front.detector-v1") == descriptor
    assert repository.get("raw.missing.front") is None


class FakeMediaMTXClient:
    def __init__(self, paths: list[MediaMTXPath]) -> None:
        self.paths = paths
        self.call_count = 0

    def list_paths(self) -> list[MediaMTXPath]:
        self.call_count += 1
        return self.paths


def test_service_reuses_runtime_registry_snapshot_within_cache_ttl():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )
    mediamtx_client = cast(
        MediaMTXClient,
        FakeMediaMTXClient([MediaMTXPath(name="raw/local/webcam", ready=True)]),
    )
    service = StreamingService(playback_url_builder=builder, mediamtx_client=mediamtx_client)

    streams = service.list_registered_streams()
    descriptor = service.get_registered_stream("raw.local.webcam")
    status = service.module_status()

    assert descriptor is not None
    assert descriptor.status == "online"
    assert status.registered_streams == len(streams)
    assert cast(FakeMediaMTXClient, mediamtx_client).call_count == 1


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
    route_paths = {route.path for route in stream_router.routes if isinstance(route, Route)}

    assert "/module/status" in route_paths
    assert "/module/playback/{stream_id}" in route_paths
    assert "/module/registry" in route_paths
    assert "/module/registry/{stream_id}" in route_paths


def test_streaming_module_status_router_returns_testable_payload():
    response = run_async(get_streaming_module_status())

    assert response.model_dump(by_alias=True) == {
        "registryReady": True,
        "playbackUrlBuilderReady": True,
        "registeredStreams": 4,
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
        "raw.local.webcam",
    ]


def test_streaming_module_registry_router_returns_sample_front_seed(monkeypatch):
    service = StreamingService(playback_url_builder=PlaybackUrlBuilder())
    monkeypatch.setattr(streaming_router_module, "default_streaming_service", service)

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


def test_streaming_module_registry_router_returns_local_webcam_seed(monkeypatch):
    service = StreamingService(playback_url_builder=PlaybackUrlBuilder())
    monkeypatch.setattr(streaming_router_module, "default_streaming_service", service)

    response = run_async(get_stream_registry_item("raw.local.webcam"))

    assert response.model_dump(by_alias=True) == {
        "streamId": "raw.local.webcam",
        "path": "raw/local/webcam",
        "prefix": "raw",
        "assetId": "local",
        "sensorId": "webcam",
        "processorId": None,
        "date": None,
        "status": "registered",
        "displayName": "Local Webcam Test Harness",
        "playbackUrls": {"webrtc": None, "hls": None},
    }
