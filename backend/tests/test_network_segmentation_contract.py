from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"

EXPECTED_NETWORKS = {
    "postgres-geo": {"control-net"},
    "redis": {"control-net"},
    "mqtt": {"broker-net"},
    "backend": {"control-net", "stream-net", "edge-net", "egress-net"},
    "auth-policy": {"control-net", "edge-net", "egress-net"},
    "media-control": {"control-net", "broker-net", "stream-net", "edge-net", "egress-net"},
    "mediamtx": {"stream-net", "turn-net"},
    "turn-primary": {"turn-net"},
    "turn-secondary": {"turn-net"},
    "dashboard": {"edge-net"},
    "mobile-publisher": {"edge-net"},
    "edge": {"edge-net", "stream-net"},
}


def load_compose() -> dict:
    return yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))


def test_services_attach_only_to_the_owned_network_matrix() -> None:
    services = load_compose()["services"]

    for service_name, expected in EXPECTED_NETWORKS.items():
        assert set(services[service_name]["networks"]) == expected


def test_private_networks_have_no_external_gateway() -> None:
    networks = load_compose()["networks"]

    for network_name in ("control-net", "broker-net", "edge-net"):
        assert networks[network_name]["internal"] is True

    for network_name in ("stream-net", "turn-net", "egress-net"):
        assert networks[network_name].get("internal", False) is False


def test_untrusted_presentation_services_cannot_resolve_stateful_services() -> None:
    services = load_compose()["services"]

    for service_name in ("dashboard", "mobile-publisher", "edge"):
        service_networks = set(services[service_name]["networks"])
        assert "control-net" not in service_networks
        assert "broker-net" not in service_networks


def test_only_media_control_bridges_broker_to_application_networks() -> None:
    services = load_compose()["services"]
    broker_members = {
        service_name for service_name, service in services.items() if "broker-net" in service.get("networks", [])
    }

    assert broker_members == {"mqtt", "media-control"}
