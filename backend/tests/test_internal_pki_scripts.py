from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREPARE = ROOT / "scripts/ops/prepare_internal_pki.sh"
CHECK = ROOT / "scripts/ops/check_internal_pki.sh"


def test_internal_pki_generation_is_private_and_bounded() -> None:
    source = PREPARE.read_text(encoding="utf-8")

    assert "PKI output must be outside the repository" in source
    assert "refusing to overwrite an existing CA" in source
    assert "rsa_keygen_bits:3072" in source
    assert "-sha384" in source
    assert "-days 90" in source
    assert "chmod 600" in source
    assert "serverAuth" in source and "clientAuth" in source


def test_internal_pki_check_fails_before_expiry() -> None:
    source = CHECK.read_text(encoding="utf-8")

    assert "openssl verify" in source
    assert "openssl x509 -checkend" in source
    assert "PKI_EXPIRY_WARN_SECONDS:-1209600" in source
    assert '"600"' in source and '"400"' in source
