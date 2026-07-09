import httpx
import pytest
import respx

from modules.streaming.mediamtx_client import (
    MediaMTXApiQuery,
    MediaMTXApiRoutes,
    MediaMTXClient,
    MediaMTXClientError,
    MediaMTXHttpHeaders,
    MediaMTXPath,
)

MEDIAMTX_BASE_URL = "https://mediamtx.internal.test"


@respx.mock
def test_mediamtx_client_builds_paths_request_contract() -> None:
    route = respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "name": "raw/drone-01/front",
                        "ready": True,
                        "source": {"type": "rtspSession"},
                        "readers": [{"id": "reader-1"}],
                    }
                ]
            },
        )
    )

    paths = MediaMTXClient(MEDIAMTX_BASE_URL).list_paths()

    assert paths == [MediaMTXPath(name="raw/drone-01/front", ready=True, source_type="rtspSession", reader_count=1)]
    assert route.called
    request = route.calls.last.request
    assert request.url.params[MediaMTXApiQuery.ITEMS_PER_PAGE] == MediaMTXApiQuery.DEFAULT_ITEMS_PER_PAGE
    assert request.headers[MediaMTXHttpHeaders.ACCEPT] == MediaMTXHttpHeaders.APPLICATION_JSON


@respx.mock
def test_mediamtx_client_maps_5xx_to_domain_error() -> None:
    respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(return_value=httpx.Response(503))

    with pytest.raises(MediaMTXClientError, match="MediaMTX API request failed"):
        MediaMTXClient(MEDIAMTX_BASE_URL).list_paths()


@respx.mock
def test_mediamtx_client_maps_timeout_to_domain_error() -> None:
    respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(
        side_effect=httpx.TimeoutException("timed out")
    )

    with pytest.raises(MediaMTXClientError, match="MediaMTX API request failed"):
        MediaMTXClient(MEDIAMTX_BASE_URL).list_paths()


@respx.mock
def test_mediamtx_client_rejects_invalid_body_contract() -> None:
    respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(
        return_value=httpx.Response(200, content=b"not-json")
    )

    with pytest.raises(MediaMTXClientError, match="invalid JSON"):
        MediaMTXClient(MEDIAMTX_BASE_URL).list_paths()


@respx.mock
def test_mediamtx_client_rejects_missing_items_list_contract() -> None:
    respx.get(f"{MEDIAMTX_BASE_URL}{MediaMTXApiRoutes.PATHS_LIST}").mock(
        return_value=httpx.Response(200, json={"items": {"bad": "shape"}})
    )

    with pytest.raises(MediaMTXClientError, match="missing an items list"):
        MediaMTXClient(MEDIAMTX_BASE_URL).list_paths()
