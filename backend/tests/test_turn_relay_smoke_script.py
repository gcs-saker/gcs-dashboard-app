import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "turn_relay_smoke.py"


def load_turn_smoke_module():
    spec = importlib.util.spec_from_file_location("turn_relay_smoke", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_turn_relay_smoke_script_check_mode_passes_without_credentials() -> None:
    result = subprocess.run(
        [str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "TURN relay smoke check passed" in result.stdout
    assert "XOR-RELAYED-ADDRESS" in result.stdout


def test_turn_relay_smoke_parses_turn_udp_url() -> None:
    module = load_turn_smoke_module()

    target = module.parse_turn_url("turn:a4ai.tplinkdns.com:3478?transport=udp")

    assert target.host == "a4ai.tplinkdns.com"
    assert target.port == 3478
    assert target.transport == "udp"


def test_turn_relay_smoke_rejects_unsupported_transport() -> None:
    module = load_turn_smoke_module()

    try:
        module.parse_turn_url("turn:a4ai.tplinkdns.com:3478?transport=tls")
    except ValueError as error:
        assert "udp or tcp" in str(error)
    else:
        raise AssertionError("unsupported TURN transport should be rejected")


def test_turn_relay_smoke_static_contract_mentions_stale_nonce_retry() -> None:
    script = SCRIPT.read_text(encoding="utf-8")

    assert "438" in script
    assert "stale nonce" in script.lower()
