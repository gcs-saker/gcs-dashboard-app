from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from main import app


def test_stream_api_requires_authentication_and_accepts_viewer_token(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    with TestClient(app) as client:
        missing_response = client.get("/api/v1/streams")
        assert missing_response.status_code == 401

        viewer_response = client.get("/api/v1/streams", headers=auth_headers("viewer01", "viewer"))
        assert viewer_response.status_code == 200
        assert viewer_response.json()[0]["streamId"] == "raw.sample.front"


@pytest.mark.parametrize(
    ("query", "expected_status"),
    [
        ("limit=1&offset=0", 200),
        ("limit=500&offset=100000", 200),
        ("limit=0&offset=0", 422),
        ("limit=501&offset=0", 422),
        ("limit=1&offset=-1", 422),
        ("limit=1&offset=100001", 422),
    ],
)
def test_telemetry_pagination_enforces_exact_boundaries(
    auth_headers: Callable[[str, str], dict[str, str]],
    query: str,
    expected_status: int,
) -> None:
    with TestClient(app) as client:
        response = client.get(
            f"/telemetry/all?{query}",
            headers=auth_headers("viewer01", "viewer"),
        )

    assert response.status_code == expected_status
