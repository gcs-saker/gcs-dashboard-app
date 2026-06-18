import mqtt.client as mqtt_client
from mqtt.client import MqttSettings, get_mqtt_client, publish_control_command


class FakeMqttClient:
    def __init__(self) -> None:
        self.published: list[tuple[str, str | bytes]] = []
        self.connected: tuple[str, int, int] | None = None
        self.loop_started = False
        self.credentials: tuple[str, str | None] | None = None

    def connect(self, host: str, port: int, keepalive: int) -> None:
        self.connected = (host, port, keepalive)

    def username_pw_set(self, username: str, password: str | None = None) -> None:
        self.credentials = (username, password)

    def loop_start(self) -> None:
        self.loop_started = True

    def publish(self, topic: str, payload: str | bytes) -> None:
        self.published.append((topic, payload))


def test_mqtt_settings_from_env(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_HOST", "mqtt.internal")
    monkeypatch.setenv("MQTT_PORT", "1884")
    monkeypatch.setenv("MQTT_CLIENT_ID", "dashboard-test")
    monkeypatch.setenv("MQTT_KEEPALIVE", "30")
    monkeypatch.setenv("MQTT_USERNAME", "gcs-ingest")
    monkeypatch.setenv("MQTT_PASSWORD", "secret")

    settings = MqttSettings.from_env()

    assert settings == MqttSettings(
        host="mqtt.internal",
        port=1884,
        client_id="dashboard-test",
        keepalive=30,
        username="gcs-ingest",
        password="secret",
    )


def test_mqtt_settings_treats_blank_credentials_as_unset(monkeypatch) -> None:
    monkeypatch.setenv("MQTT_USERNAME", " ")
    monkeypatch.setenv("MQTT_PASSWORD", "")

    settings = MqttSettings.from_env()

    assert settings.username is None
    assert settings.password is None


def test_publish_control_command_uses_injected_client() -> None:
    client = FakeMqttClient()

    publish_control_command("robot/control/CID001", "forward", client=client)

    assert client.published == [("robot/control/CID001", "forward")]


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
    assert fake_client.loop_started is True
    get_mqtt_client.cache_clear()
