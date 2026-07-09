import pytest

from model.stream_model import StreamPathError, validate_stream_path
from modules.streaming import PlaybackUrlBuilder, PlaybackUrlBuilderConfig, PlaybackUrlBuilderError


def test_playback_url_builder_generates_whep_and_hls_urls_from_stream_id():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="https://media.example.com/webrtc",
            public_hls_base_url="https://media.example.com/hls",
        )
    )

    playback_urls = builder.build_from_stream_id("raw.sample.front")

    assert playback_urls.webrtc == "https://media.example.com/webrtc/raw/sample/front/whep"
    assert playback_urls.hls == "https://media.example.com/hls/raw/sample/front/index.m3u8"


def test_playback_url_builder_generates_urls_from_validated_stream_path():
    builder = PlaybackUrlBuilder(
        PlaybackUrlBuilderConfig(
            public_webrtc_base_url="http://localhost:8889/",
            public_hls_base_url="http://localhost:8888/",
        )
    )
    stream_path = validate_stream_path("ai/drn-01/front/detector-v1")

    playback_urls = builder.build(stream_path)

    assert playback_urls.webrtc == "http://localhost:8889/ai/drn-01/front/detector-v1/whep"
    assert playback_urls.hls == "http://localhost:8888/ai/drn-01/front/detector-v1/index.m3u8"


def test_playback_url_builder_uses_env_config(monkeypatch):
    monkeypatch.setenv("MEDIAMTX_PUBLIC_WEBRTC_BASE_URL", "https://stream.example.test/webrtc")
    monkeypatch.setenv("MEDIAMTX_PUBLIC_HLS_BASE_URL", "https://stream.example.test/hls")

    playback_urls = PlaybackUrlBuilder.from_env().build_from_stream_id("archive.ugv-02.rear.2026-05-22")

    assert playback_urls.webrtc == "https://stream.example.test/webrtc/archive/ugv-02/rear/2026-05-22/whep"
    assert playback_urls.hls == "https://stream.example.test/hls/archive/ugv-02/rear/2026-05-22/index.m3u8"


def test_playback_url_builder_returns_none_for_unconfigured_protocols():
    playback_urls = PlaybackUrlBuilder().build_from_stream_id("raw.sample.front")

    assert playback_urls.webrtc is None
    assert playback_urls.hls is None


@pytest.mark.parametrize(
    "base_url",
    [
        "wss://media.example.com/webrtc",
        "ftp://media.example.com/hls",
        "media.example.com/hls",
        "",
    ],
)
def test_playback_url_builder_rejects_non_http_public_base_urls(base_url):
    builder = PlaybackUrlBuilder(PlaybackUrlBuilderConfig(public_webrtc_base_url=base_url))

    with pytest.raises(PlaybackUrlBuilderError) as exc_info:
        builder.build_from_stream_id("raw.sample.front")

    assert str(exc_info.value) == "playback base URL must be an absolute HTTP(S) URL"


@pytest.mark.parametrize(
    "stream_id",
    [
        "raw.sample",
        "raw/sample/front",
        "raw..front",
        "unknown.sample.front",
    ],
)
def test_playback_url_builder_rejects_invalid_stream_ids(stream_id):
    builder = PlaybackUrlBuilder(PlaybackUrlBuilderConfig(public_webrtc_base_url="https://media.example.com/webrtc"))

    with pytest.raises(StreamPathError):
        builder.build_from_stream_id(stream_id)
