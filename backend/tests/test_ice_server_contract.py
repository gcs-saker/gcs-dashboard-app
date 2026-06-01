from config import BrowserIceServer, BrowserIceServerList, IceServerFields, WebRtcIceSettings


def test_browser_ice_server_list_defensively_copies_and_serializes_contract_fields() -> None:
    servers = (BrowserIceServer.stun("stun:turn.local:3478"),)

    ice_servers = BrowserIceServerList.of(servers)

    assert ice_servers.values == servers
    assert ice_servers.to_api_response() == ({IceServerFields.URLS: "stun:turn.local:3478"},)


def test_webrtc_ice_settings_builds_stun_turn_first_class_list() -> None:
    settings = WebRtcIceSettings(
        stun_url="stun:turn.local:3478",
        turn_url="turn:turn.local:3478?transport=udp",
        turn_username="gcs-turn",
        turn_password="secret",
    )

    ice_servers = settings.browser_ice_server_list()

    assert ice_servers.to_api_response() == (
        {IceServerFields.URLS: "stun:turn.local:3478"},
        {
            IceServerFields.URLS: "turn:turn.local:3478?transport=udp",
            IceServerFields.USERNAME: "gcs-turn",
            IceServerFields.CREDENTIAL: "secret",
        },
    )
