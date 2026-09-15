import runpy
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RELEASE_GATE = REPOSITORY_ROOT / "scripts" / "ops" / "release_gate.py"


def validate_environment(path: Path) -> None:
    runpy.run_path(str(RELEASE_GATE), run_name="release_gate_test")["validate_public_endpoint_environment"](path)


def validate_runtime_environment(path: Path) -> None:
    runpy.run_path(str(RELEASE_GATE), run_name="release_gate_test")["validate_runtime_environment"](path)


def write_runtime_environment(path: Path, **overrides: str) -> None:
    values = {
        "AUTH_POLICY_ADMIN_MFA_SECRET": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
        "MOBILE_PUBLISHER_IMAGE": "registry.example/gcs/mobile@sha256:" + "a" * 64,
        "TURN_RELAY_MIN_PORT": "49160",
        "TURN_PRIMARY_RELAY_MAX_PORT": "49180",
        "TURN_SECONDARY_RELAY_MIN_PORT": "49181",
        "TURN_RELAY_MAX_PORT": "49200",
        "TURN_PRIMARY_RELAY_HOST_MIN_PORT": "49160",
        "TURN_PRIMARY_RELAY_HOST_MAX_PORT": "49180",
        "TURN_SECONDARY_RELAY_HOST_MIN_PORT": "49181",
        "TURN_SECONDARY_RELAY_HOST_MAX_PORT": "49200",
    }
    values.update(overrides)
    path.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")


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


def test_release_gate_accepts_valid_runtime_secrets_images_and_turn_ranges(tmp_path: Path) -> None:
    env_file = tmp_path / "production.env"
    write_runtime_environment(env_file)

    validate_runtime_environment(env_file)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"AUTH_POLICY_ADMIN_MFA_SECRET": "replace-with-base32-secret-outside-git"}, "valid Base32"),
        ({"AUTH_POLICY_ADMIN_MFA_SECRET": "JBSWY3DP"}, "at least 160 bits"),
        ({"MOBILE_PUBLISHER_IMAGE": "gcs-mobile-publisher:latest"}, "immutable sha256 digest"),
        ({"TURN_PRIMARY_RELAY_HOST_MAX_PORT": "49179", "TURN_SECONDARY_RELAY_HOST_MIN_PORT": "49180"}, "range sizes must match"),
        ({"TURN_SECONDARY_RELAY_MIN_PORT": "49182"}, "positive and contiguous"),
    ],
)
def test_release_gate_rejects_unsafe_runtime_configuration(
    tmp_path: Path, override: dict[str, str], message: str,
) -> None:
    env_file = tmp_path / "production.env"
    write_runtime_environment(env_file, **override)

    with pytest.raises(RuntimeError, match=message):
        validate_runtime_environment(env_file)
