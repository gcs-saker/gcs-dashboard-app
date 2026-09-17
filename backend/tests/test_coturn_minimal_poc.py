from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "deploy/coturn/Dockerfile.minimal-poc"
SMOKE = ROOT / "scripts/smoke/coturn_minimal_poc_smoke.py"


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


def test_minimal_coturn_reuses_the_production_dynamic_allowlist_entrypoint() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "COPY turnserver-entrypoint.sh /usr/local/bin/gcs-turnserver-entrypoint" in source
    assert 'ENTRYPOINT ["/bin/sh", "/usr/local/bin/gcs-turnserver-entrypoint"]' in source


def test_minimal_coturn_promotion_contract_keeps_physical_talkback_blocked() -> None:
    source = SMOKE.read_text(encoding="utf-8")

    assert "relay-only WHIP publish" in source
    assert "relay-only WHEP audio and video frames" in source
    assert "physical mobile Talkback receive and intelligibility" in source
    assert "compose image replacement" in source
