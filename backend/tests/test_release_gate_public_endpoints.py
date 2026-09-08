import runpy
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RELEASE_GATE = REPOSITORY_ROOT / "scripts" / "ops" / "release_gate.py"


def validate_environment(path: Path) -> None:
    runpy.run_path(str(RELEASE_GATE), run_name="release_gate_test")["validate_public_endpoint_environment"](path)


def test_release_gate_accepts_owned_public_endpoints(tmp_path: Path) -> None:
    env_file = tmp_path / "production.env"
    env_file.write_text(
        "VITE_LOCAL_WEBCAM_WHIP_URL=https://gcs-saker.com/webrtc/raw/local/webcam/whip\n"
        "MEDIA_CONTROL_TURN_PRIMARY_URL=turn:turn.gcs-saker.com:3478?transport=udp\n",
        encoding="utf-8",
    )

    validate_environment(env_file)


@pytest.mark.parametrize("hostname", ["a4ai.tplinkdns.com", "a4ai.121-159-26-245.sslip.io"])
def test_release_gate_rejects_retired_browser_endpoint(tmp_path: Path, hostname: str) -> None:
    env_file = tmp_path / "production.env"
    env_file.write_text(
        f"VITE_LOCAL_WEBCAM_WHIP_URL=https://{hostname}/webrtc/raw/local/webcam/whip\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="VITE_LOCAL_WEBCAM_WHIP_URL references a retired production hostname"):
        validate_environment(env_file)
