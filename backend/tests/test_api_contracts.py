from api.contracts import (
    AuthRoutes,
    ControlRoutes,
    HealthRoutes,
    MapRoutes,
    RouterPrefixes,
    StreamRoutes,
    TelemetryRoutes,
)


def test_python_api_route_contracts_are_domain_scoped() -> None:
    assert AuthRoutes.LOGIN == "/login"
    assert HealthRoutes.HEALTHZ == "/healthz"
    assert StreamRoutes.ICE_SERVERS == "/streams/ice-servers"
    assert MapRoutes.CONFIG == "/map/config"
    assert TelemetryRoutes.ALL == "/all"
    assert ControlRoutes.SEND == "/"


def test_python_router_prefix_contracts_match_edge_proxy_paths() -> None:
    assert RouterPrefixes.AUTH == "/auth"
    assert RouterPrefixes.API_V1 == "/api/v1"
    assert RouterPrefixes.STREAM_LEGACY == "/stream"


def test_stream_route_order_keeps_static_routes_before_stream_id_route() -> None:
    routes = [
        StreamRoutes.STREAMS,
        StreamRoutes.ICE_SERVERS,
        StreamRoutes.PLAYBACK,
        StreamRoutes.STREAM_STATUS,
        StreamRoutes.STREAM_DETAIL,
    ]

    assert len(routes) == len(set(routes))
    assert routes.index(StreamRoutes.ICE_SERVERS) < routes.index(StreamRoutes.STREAM_DETAIL)
