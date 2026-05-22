import asyncio

from fastapi import HTTPException
import pytest

from api.stream import resolve_stream_id, resolve_stream_path
from model.stream_model import (
    StreamPathError,
    path_to_stream_id,
    stream_id_to_path,
    validate_stream_id,
    validate_stream_path,
)


def run_async(coro):
    return asyncio.run(coro)


@pytest.mark.parametrize(
    ("path", "stream_id", "prefix", "extra"),
    [
        ("raw/robot-001/front", "raw.robot-001.front", "raw", {"processorId": None, "date": None}),
        (
            "ai/drone_02/thermal/detector-v1",
            "ai.drone_02.thermal.detector-v1",
            "ai",
            {"processorId": "detector-v1", "date": None},
        ),
        (
            "archive/ugv-03/front/2026-05-22",
            "archive.ugv-03.front.2026-05-22",
            "archive",
            {"processorId": None, "date": "2026-05-22"},
        ),
    ],
)
def test_stream_path_and_stream_id_convert_both_directions(path, stream_id, prefix, extra):
    parsed_from_path = validate_stream_path(path)
    parsed_from_id = validate_stream_id(stream_id)

    assert parsed_from_path.path == path
    assert parsed_from_path.stream_id == stream_id
    assert parsed_from_path.prefix == prefix
    assert parsed_from_path.to_api_dict()["processorId"] == extra["processorId"]
    assert parsed_from_path.to_api_dict()["date"] == extra["date"]
    assert parsed_from_id.path == path
    assert parsed_from_id.stream_id == stream_id
    assert path_to_stream_id(path) == stream_id
    assert stream_id_to_path(stream_id) == path


@pytest.mark.parametrize(
    "path",
    [
        "raw/robot-001/front",
        "ai/robot-001/front/detector-v1",
        "archive/robot-001/front/2026-05-22",
    ],
)
def test_allowed_prefix_shapes_are_accepted(path):
    assert validate_stream_path(path).path == path


@pytest.mark.parametrize(
    "path",
    [
        "",
        "/raw/robot-001/front",
        "raw/robot-001/front/",
        "raw//front",
        "raw/../front",
        "raw/robot-001/../front",
        "raw/robot.001/front",
        "raw/robot 001/front",
        "raw/robot-001/front%2Fwide",
        "raw/robot-001\\front",
        "raw/robot-001",
        "ai/robot-001/front",
        "archive/robot-001/front/not-a-date",
        "archive/robot-001/front/2026-02-31",
        "unknown/robot-001/front",
    ],
)
def test_invalid_stream_paths_are_rejected(path):
    with pytest.raises(StreamPathError):
        validate_stream_path(path)


@pytest.mark.parametrize(
    "stream_id",
    [
        "",
        ".raw.robot-001.front",
        "raw.robot-001.front.",
        "raw..front",
        "raw/robot-001/front",
        "raw.robot-001.front/wide",
        "raw.robot-001.없는센서",
        "ai.robot-001.front",
        "archive.robot-001.front.2026-13-01",
    ],
)
def test_invalid_stream_ids_are_rejected(stream_id):
    with pytest.raises(StreamPathError):
        validate_stream_id(stream_id)


def test_stream_api_resolves_stream_id_to_path():
    response = run_async(resolve_stream_id("ai.drone-01.front.detector-v1"))

    assert response == {
        "prefix": "ai",
        "assetId": "drone-01",
        "sensorId": "front",
        "processorId": "detector-v1",
        "date": None,
        "path": "ai/drone-01/front/detector-v1",
        "streamId": "ai.drone-01.front.detector-v1",
    }


def test_stream_api_resolves_path_to_stream_id():
    response = run_async(resolve_stream_path("archive/ugv-02/rear/2026-05-22"))

    assert response["path"] == "archive/ugv-02/rear/2026-05-22"
    assert response["streamId"] == "archive.ugv-02.rear.2026-05-22"


@pytest.mark.parametrize(
    ("resolver", "value"),
    [
        (resolve_stream_id, "raw..front"),
        (resolve_stream_path, "raw/robot.001/front"),
    ],
)
def test_stream_api_returns_422_for_invalid_input(resolver, value):
    with pytest.raises(HTTPException) as exc_info:
        run_async(resolver(value))

    assert exc_info.value.status_code == 422
    assert exc_info.value.detail
