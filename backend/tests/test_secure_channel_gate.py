from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/check_secure_channels.sh"


def test_secure_channel_gate_checks_private_and_public_protocols() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "GCS_INTERNAL_GRPC_CA_FILE" in source
    assert "AUTH_POLICY_GRPC_SERVER_NAME" in source
    assert "require_certificate true" in source
    assert "-tls1 -tls1_1" in source
    assert "-tls1_2" in source and "-tls1_3" in source
    assert "55122" not in source
