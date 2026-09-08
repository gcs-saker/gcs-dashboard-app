import mqtt.client as mqtt_client
from core.settings_base import SettingsConfigurationError
from mqtt.client import MqttSettings, get_mqtt_client, mqtt_destination_channel, publish_control_command


class FakeMqttClient:
    def __init__(self) -> None:
        self.published: list[tuple[str, str | bytes]] = []
        self.connected: tuple[str, int, int] | None = None
        self.loop_started = False
        self.credentials: tuple[str, str | None] | None = None
        self.reconnect_delays: tuple[int, int] | None = None
        self.max_inflight: int | None = None
        self.publish_rc = 0

    def connect(self, host: str, port: int, keepalive: int) -> None:
        self.connected = (host, port, keepalive)

    def username_pw_set(self, username: str, password: str | None = None) -> None:
        self.credentials = (username, password)

    def loop_start(self) -> None:
        self.loop_started = True

    def publish(self, topic: str, payload: str | bytes) -> None:
        self.published.append((topic, payload))
        return type("PublishResult", (), {"rc": self.publish_rc})()

    def reconnect_delay_set(self, min_delay: int, max_delay: int) -> None:
        self.reconnect_delays = (min_delay, max_delay)

    def max_inflight_messages_set(self, inflight: int) -> None:
        self.max_inflight = inflight


def test_mqtt_settings_from_env(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_HOST", "mqtt.internal")
    monkeypatch.setenv("MQTT_PORT", "1884")
    monkeypatch.setenv("MQTT_CLIENT_ID", "dashboard-test")
    monkeypatch.setenv("MQTT_KEEPALIVE", "30")
    monkeypatch.setenv("MQTT_USERNAME", "gcs-ingest")
    monkeypatch.setenv("MQTT_PASSWORD", "secret")
    monkeypatch.setenv("MQTT_RECONNECT_MIN_DELAY_SECONDS", "2")
    monkeypatch.setenv("MQTT_RECONNECT_MAX_DELAY_SECONDS", "45")
    monkeypatch.setenv("MQTT_MAX_INFLIGHT_MESSAGES", "10")

    settings = MqttSettings.from_env()

    assert settings == MqttSettings(
        host="mqtt.internal",
        port=1884,
        client_id="dashboard-test",
        keepalive=30,
        username="gcs-ingest",
        password="secret",
        reconnect_min_delay_seconds=2,
        reconnect_max_delay_seconds=45,
        max_inflight_messages=10,
    )


def test_mqtt_settings_treats_blank_credentials_as_unset(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_USERNAME", " ")
    monkeypatch.setenv("MQTT_PASSWORD", "")

    settings = MqttSettings.from_env()

    assert settings.username is None
    assert settings.password is None


def test_mqtt_settings_rejects_invalid_numeric_env(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_PORT", "not-a-port")

    try:
        MqttSettings.from_env()
    except SettingsConfigurationError as error:
        assert "mqtt configuration error" in str(error)
        assert "MQTT_PORT" in str(error)
    else:
        raise AssertionError("expected invalid MQTT_PORT to fail settings loading")


def test_mqtt_settings_normalizes_reconnect_window(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_RECONNECT_MIN_DELAY_SECONDS", "40")
    monkeypatch.setenv("MQTT_RECONNECT_MAX_DELAY_SECONDS", "2")

    settings = MqttSettings.from_env()

    assert settings.reconnect_min_delay_seconds == 40
    assert settings.reconnect_max_delay_seconds == 40


def test_publish_control_command_uses_injected_client() -> None:
    client = FakeMqttClient()

    publish_control_command("robot/control/CID001", "forward", client=client)

    assert client.published == [("robot/control/CID001", "forward")]


def test_mqtt_destination_channel_does_not_expose_asset_identity() -> None:
    assert mqtt_destination_channel("gcs/a4ai/co-a/device-uuid/command") == "command"
    assert mqtt_destination_channel("gcs/a4ai/co-a/device-uuid/private-route") == "unknown"


def test_publish_control_command_raises_on_publish_backpressure() -> None:
    client = FakeMqttClient()
    client.publish_rc = 4

    try:
        publish_control_command("robot/control/CID001", "forward", client=client)
    except RuntimeError as error:
        assert "MQTT publish failed" in str(error)
    else:
        raise AssertionError("expected MQTT publish failure")


def test_get_mqtt_client_connects_lazily(monkeypatch) -> None:
    fake_client = FakeMqttClient()
    get_mqtt_client.cache_clear()
    monkeypatch.setenv("MQTT_HOST", "mqtt.internal")
    monkeypatch.setenv("MQTT_PORT", "1884")
    monkeypatch.setenv("MQTT_KEEPALIVE", "30")
    monkeypatch.setenv("MQTT_USERNAME", "gcs-ingest")
    monkeypatch.setenv("MQTT_PASSWORD", "secret")
    monkeypatch.setattr(mqtt_client.mqtt, "Client", lambda client_id: fake_client)

    client = get_mqtt_client()

    assert client is fake_client
    assert fake_client.credentials == ("gcs-ingest", "secret")
    assert fake_client.connected == ("mqtt.internal", 1884, 30)
    assert fake_client.reconnect_delays == (1, 30)
    assert fake_client.max_inflight == 20
    assert fake_client.loop_started is True
    get_mqtt_client.cache_clear()
