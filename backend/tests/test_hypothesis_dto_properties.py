from __future__ import annotations

import re
from datetime import date

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from model.stream_model import stream_id_to_path, validate_stream_path
from model.telemetry_model import TelemetryCreate
from modules.protocol_v2.telemetry import TelemetryEnvelopePayload
from modules.protocol_v2.telemetry_contract import AssetKinds, HealthStates
from modules.streaming.domain import STREAM_STATUSES, PlaybackUrls, StreamDescriptor
from modules.streaming.schemas import StreamDescriptorResponse
from modules.telemetry_ingest.service import TelemetryIngestCommand

PROPERTY_TEST_SETTINGS = settings(
    max_examples=75,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

SEGMENT_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,31}")
SAFE_TEXT = (
    st.text(
        alphabet=st.characters(whitelist_categories=("Ll", "Lu", "Nd"), whitelist_characters="-_ "),
        min_size=1,
        max_size=32,
    )
    .map(str.strip)
    .filter(bool)
)
FINITE_FLOATS = st.floats(allow_nan=False, allow_infinity=False, width=32)


def stream_segment_strategy() -> st.SearchStrategy[str]:
    return st.from_regex(SEGMENT_PATTERN, fullmatch=True)


def stream_path_strategy() -> st.SearchStrategy[str]:
    segment = stream_segment_strategy()
    raw_path = st.builds(lambda asset, sensor: f"raw/{asset}/{sensor}", segment, segment)
    ai_path = st.builds(lambda asset, sensor, processor: f"ai/{asset}/{sensor}/{processor}", segment, segment, segment)
    archive_path = st.builds(
        lambda asset, sensor, archive_date: f"archive/{asset}/{sensor}/{archive_date.isoformat()}",
        segment,
        segment,
        st.dates(min_value=date(2020, 1, 1), max_value=date(2035, 12, 31)),
    )
    return st.one_of(raw_path, ai_path, archive_path)


def playback_urls_strategy() -> st.SearchStrategy[PlaybackUrls]:
    optional_url = st.one_of(st.none(), st.just("http://127.0.0.1:8889/raw/sample/whep"))
    optional_hls = st.one_of(st.none(), st.just("http://127.0.0.1:8888/raw/sample/index.m3u8"))
    return st.builds(PlaybackUrls, webrtc=optional_url, hls=optional_hls)


def stream_descriptor_strategy() -> st.SearchStrategy[StreamDescriptor]:
    return st.builds(
        StreamDescriptor,
        stream_path=stream_path_strategy().map(validate_stream_path),
        status=st.sampled_from(STREAM_STATUSES),
        display_name=st.one_of(st.none(), SAFE_TEXT),
        playback_urls=playback_urls_strategy(),
    )


def telemetry_create_strategy() -> st.SearchStrategy[TelemetryCreate]:
    return st.builds(
        TelemetryCreate,
        uuid=st.one_of(st.none(), stream_segment_strategy()),
        latitude=st.one_of(st.none(), st.floats(min_value=-90, max_value=90, allow_nan=False, allow_infinity=False)),
        longitude=st.one_of(st.none(), st.floats(min_value=-180, max_value=180, allow_nan=False, allow_infinity=False)),
        altitude=st.one_of(
            st.none(), st.floats(min_value=-500, max_value=20_000, allow_nan=False, allow_infinity=False)
        ),
        magneticX=st.one_of(st.none(), FINITE_FLOATS),
        magneticY=st.one_of(st.none(), FINITE_FLOATS),
        magneticZ=st.one_of(st.none(), FINITE_FLOATS),
        soc=st.one_of(st.none(), SAFE_TEXT),
        phoneBatterySOC=st.one_of(
            st.none(), st.floats(min_value=0, max_value=100, allow_nan=False, allow_infinity=False)
        ),
        velocity=st.one_of(st.none(), st.floats(min_value=0, max_value=150, allow_nan=False, allow_infinity=False)),
        totalDistance=st.one_of(
            st.none(), st.floats(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False)
        ),
        epochTime=st.one_of(st.none(), st.integers(min_value=0, max_value=86_400_000)),
        portDistance=st.one_of(
            st.none(), st.floats(min_value=0, max_value=1_000_000, allow_nan=False, allow_infinity=False)
        ),
    )


def telemetry_envelope_strategy() -> st.SearchStrategy[TelemetryEnvelopePayload]:
    stream_ids = st.tuples(stream_path_strategy().map(lambda path: path.replace("/", ".")))
    return st.builds(
        TelemetryEnvelopePayload,
        event_id=stream_segment_strategy(),
        org_id=stream_segment_strategy(),
        group_id=stream_segment_strategy(),
        asset_id=stream_segment_strategy(),
        asset_kind=st.sampled_from(
            (
                AssetKinds.UNSPECIFIED,
                AssetKinds.DRONE,
                AssetKinds.GROUND_ROBOT,
                AssetKinds.FIXED_CAMERA,
                AssetKinds.OPERATOR_DEVICE,
            )
        ),
        observed_unix_millis=st.integers(min_value=0, max_value=4_102_444_800_000),
        received_unix_millis=st.integers(min_value=0, max_value=4_102_444_800_000),
        latitude=st.floats(min_value=-90, max_value=90, allow_nan=False, allow_infinity=False),
        longitude=st.floats(min_value=-180, max_value=180, allow_nan=False, allow_infinity=False),
        altitude_m=st.floats(min_value=-500, max_value=20_000, allow_nan=False, allow_infinity=False),
        heading_deg=st.floats(min_value=0, max_value=360, allow_nan=False, allow_infinity=False),
        speed_mps=st.floats(min_value=0, max_value=150, allow_nan=False, allow_infinity=False),
        battery_percent=st.floats(min_value=0, max_value=100, allow_nan=False, allow_infinity=False),
        health=st.sampled_from(
            (
                HealthStates.UNSPECIFIED,
                HealthStates.OK,
                HealthStates.WARN,
                HealthStates.ERROR,
                HealthStates.OFFLINE,
            )
        ),
        active_stream_ids=stream_ids,
    )


@PROPERTY_TEST_SETTINGS
@given(stream_descriptor_strategy())
def test_stream_descriptor_response_preserves_domain_contract(descriptor: StreamDescriptor) -> None:
    response = StreamDescriptorResponse.from_domain(descriptor)
    payload = response.model_dump(by_alias=True)

    assert payload["streamId"] == descriptor.stream_id
    assert payload["path"] == descriptor.path
    assert payload["status"] == descriptor.status
    assert payload["playbackUrls"]["webrtc"] == descriptor.playback_urls.webrtc
    assert payload["playbackUrls"]["hls"] == descriptor.playback_urls.hls
    assert stream_id_to_path(payload["streamId"]) == payload["path"]


@PROPERTY_TEST_SETTINGS
@given(telemetry_create_strategy())
def test_telemetry_command_snapshot_preserves_nullable_dto_fields(payload: TelemetryCreate) -> None:
    snapshot = TelemetryIngestCommand.from_create(payload).response_snapshot()
    snapshot_payload = snapshot.model_dump()
    source_payload = payload.model_dump()

    for field_name, value in source_payload.items():
        if field_name == "epochTime":
            continue
        assert snapshot_payload[field_name] == value
    if payload.epochTime is None:
        assert snapshot.epochTime is None
    else:
        assert isinstance(snapshot.epochTime, str)
        assert snapshot.epochTime.count(":") == 2


@PROPERTY_TEST_SETTINGS
@given(telemetry_envelope_strategy())
def test_telemetry_protobuf_envelope_roundtrips_contract(payload: TelemetryEnvelopePayload) -> None:
    decoded = TelemetryEnvelopePayload.from_protobuf_wire(payload.to_protobuf_wire())

    assert decoded == payload
    legacy = decoded.to_legacy_telemetry()
    assert legacy.uuid == payload.asset_id
    assert legacy.latitude == payload.latitude
    assert legacy.longitude == payload.longitude
    assert legacy.phoneBatterySOC == payload.battery_percent
