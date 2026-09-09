from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREPARE = ROOT / "scripts/ops/prepare_internal_pki.sh"
CHECK = ROOT / "scripts/ops/check_internal_pki.sh"
ISSUE_DEVICE = ROOT / "scripts/ops/issue_device_certificate.sh"
REVOKE = ROOT / "scripts/ops/revoke_internal_certificate.sh"
ROTATE = ROOT / "scripts/ops/stage_internal_ca_rotation.sh"


def test_internal_pki_generation_is_private_and_bounded() -> None:
    source = PREPARE.read_text(encoding="utf-8")

    assert "PKI output must be outside the repository" in source
    assert "refusing to overwrite an existing CA" in source
    assert "rsa_keygen_bits:3072" in source
    assert "-sha384" in source
    assert "default_days=90" in source
    assert "chmod 600" in source
    assert "serverAuth" in source and "clientAuth" in source
    assert "openssl ca -gencrl" in source


def test_internal_pki_check_fails_before_expiry() -> None:
    source = CHECK.read_text(encoding="utf-8")

    assert "openssl verify" in source
    assert "openssl x509 -checkend" in source
    assert "PKI_EXPIRY_WARN_SECONDS:-1209600" in source
    assert '"600"' in source and '"400"' in source


def test_device_issuance_and_revocation_are_bounded_to_private_pki() -> None:
    issue = ISSUE_DEVICE.read_text(encoding="utf-8")
    revoke = REVOKE.read_text(encoding="utf-8")

    assert "asset UUID format is invalid" in issue
    assert "refusing to overwrite device identity" in issue
    assert "URI:urn:gcs-saker:device:" in issue
    assert "-extensions client_cert" in issue
    assert "certificate must be an exact file inside the PKI directory" in revoke
    assert "root CA revocation requires CA rotation" in revoke
    assert "ca.crl" in revoke and "mv -f" in revoke


def test_ca_rotation_requires_dual_trust_and_no_overwrite() -> None:
    source = ROTATE.read_text(encoding="utf-8")

    assert "refusing to overwrite trust bundle" in source
    assert '"${old_ca}" "${new_ca}"' in source
    assert "rotate leaves before removing the old CA" in source
