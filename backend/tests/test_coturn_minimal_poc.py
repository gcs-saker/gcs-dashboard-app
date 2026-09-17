from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy/coturn/Dockerfile.minimal-poc"


def test_minimal_coturn_is_isolated_and_disables_unused_integrations() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "1986df21e4b4152b5e0216989f649e20ff76aced" in source
    for flag in ("TURN_NO_PQ", "TURN_NO_MYSQL", "TURN_NO_MONGO", "TURN_NO_HIREDIS", "TURN_NO_SQLITE"):
        assert f"{flag}=1" in source
    assert "TURN_NO_PROMETHEUS=1" in source
    assert "TURN_NO_SYSTEMD=1" in source
    assert "libpq" not in source
    assert "libmariadb" not in source
    assert "libkrb5" not in source


def test_minimal_coturn_is_not_wired_into_compose() -> None:
    compose = (ROOT / "deploy/compose/compose.single-node.poc.yml").read_text(encoding="utf-8")

    assert "Dockerfile.minimal-poc" not in compose
    assert "gcs-saker-turn:minimal-poc" not in compose
