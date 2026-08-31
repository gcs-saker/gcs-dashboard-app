from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from main import app
from modules.messaging.control_publisher import ControlMessagePublisher, get_control_message_publisher
from tests.auth_api_fixtures import (
    FailingMessageSender,
    RecordingMessageSender,
)


def test_stream_api_requires_authentication_and_accepts_viewer_token(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    with TestClient(app) as client:
        missing_response = client.get("/api/v1/streams")
        assert missing_response.status_code == 401

        viewer_response = client.get("/api/v1/streams", headers=auth_headers("viewer01", "viewer"))
        assert viewer_response.status_code == 200
        assert viewer_response.json()[0]["streamId"] == "raw.sample.front"


def test_control_api_requires_operator_role(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        viewer_response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("viewer01", "viewer"),
        )
        assert viewer_response.status_code == 403
        assert viewer_response.json() == {"detail": "operator role required"}

        operator_response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("operator01", "operator"),
        )
        assert operator_response.status_code == 200
        assert operator_response.json()["status"] == "sent"
        assert published == [("robot/control/CID001", "stop")]

    app.dependency_overrides.pop(get_control_message_publisher, None)


def test_control_api_can_publish_protobuf_v2_command_payload(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json={
                "cid": "CID001",
                "direction": "stop",
                "payload_format": "protobuf",
                "org_id": "a4ai",
                "group_id": "co-a",
                "stream_id": "raw.mobile.front",
            },
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 200
    assert response.json()["topic"] == "gcs/a4ai/co-a/CID001/command"
    assert len(published) == 1
    assert published[0][0] == "gcs/a4ai/co-a/CID001/command"
    assert isinstance(published[0][1], bytes)
    app.dependency_overrides.pop(get_control_message_publisher, None)


def test_control_api_returns_503_when_selected_sender_is_unavailable(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(FailingMessageSender())

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "gRPC gateway target is not configured"}
    app.dependency_overrides.pop(get_control_message_publisher, None)


@pytest.mark.parametrize(
    "payload",
    [
        {"cid": "CID001", "direction": "stop; rm -rf /"},
        {"cid": "../CID001", "direction": "stop"},
        {"cid": "CID001/../../x", "direction": "stop"},
    ],
)
def test_control_api_rejects_untrusted_command_payloads(
    auth_headers: Callable[[str, str], dict[str, str]],
    payload: dict[str, str],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json=payload,
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 422
    assert published == []
    app.dependency_overrides.pop(get_control_message_publisher, None)
