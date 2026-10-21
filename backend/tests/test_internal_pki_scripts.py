from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREPARE = ROOT / "scripts/ops/prepare_internal_pki.sh"
CHECK = ROOT / "scripts/ops/check_internal_pki.sh"
ISSUE_DEVICE = ROOT / "scripts/ops/issue_device_certificate.sh"
REVOKE = ROOT / "scripts/ops/revoke_internal_certificate.sh"
ROTATE = ROOT / "scripts/ops/stage_internal_ca_rotation.sh"
REFRESH_CRL = ROOT / "scripts/ops/refresh_internal_crl.sh"
SAFE_INFRA_DEPLOY = ROOT / "scripts/ops/safe_infrastructure_deploy.sh"
SAFE_STATELESS_DEPLOY = ROOT / "scripts/ops/safe_stateless_deploy.sh"


def test_internal_pki_generation_is_private_and_bounded() -> None:
    source = PREPARE.read_text(encoding="utf-8")

    assert "PKI output must be outside the repository" in source
    assert "refusing to overwrite an existing CA" in source
    assert "rsa_keygen_bits:3072" in source
    assert "-sha384" in source
    assert "default_days=90" in source
    assert "default_crl_days=30" in source
    assert "chmod 600" in source
    assert 'runtime_gid="${GCS_PKI_RUNTIME_GID:-1000}"' in source
    assert 'chgrp "${runtime_gid}"' in source
    assert 'chmod 640 "${output_real}/${key}"' in source
    assert 'chmod 644 "${output_real}"/*.crt "${output_real}/ca.crl"' in source
    assert "serverAuth" in source and "clientAuth" in source
    assert "serverAuth,clientAuth" in source
    assert "issue_identity media-control media-control serverClientAuth" in source
    assert "openssl ca -gencrl" in source
    assert "mqtt-device-other" in source
    assert "mqtt-device-revoked" in source
    assert 'openssl ca -batch -config "${output_real}/openssl-ca.cnf"' in source
    assert '-revoke "${output_real}/mqtt-device-revoked.crt"' in source


def test_internal_pki_check_fails_before_expiry() -> None:
    source = CHECK.read_text(encoding="utf-8")

    assert "openssl verify" in source
    assert "openssl x509 -checkend" in source
    assert "openssl crl" in source and "-nextupdate" in source
    assert "-CRLfile" in source and "-crl_check" in source
    assert "PKI_EXPIRY_WARN_SECONDS:-1209600" in source
    assert 'runtime_gid="${GCS_PKI_RUNTIME_GID:-1000}"' in source
    assert "600|400" in source and "640|440" in source
    assert '"${group_id}" == "${runtime_gid}"' in source


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


def test_crl_refresh_is_bounded_and_atomic() -> None:
    source = REFRESH_CRL.read_text(encoding="utf-8")

    assert "PKI directory must be outside the repository" in source
    assert "PKI_CRL_MIN_VALIDITY_SECONDS:-1209600" in source
    assert "PKI_CRL_VALIDITY_DAYS:-30" in source
    assert '"${validity_days}" -ge 14' in source and '"${validity_days}" -le 365' in source
    assert 'openssl ca -batch -gencrl -crldays "${validity_days}"' in source
    assert "openssl crl" in source and "-nextupdate" in source
    assert "mktemp" in source and "mv -f" in source


def test_deployments_fail_before_mutation_when_current_crl_is_stale() -> None:
    infrastructure = SAFE_INFRA_DEPLOY.read_text(encoding="utf-8")
    stateless = SAFE_STATELESS_DEPLOY.read_text(encoding="utf-8")

    assert infrastructure.index("check_current_internal_pki") < infrastructure.index("backup_mqtt_data")
    assert infrastructure.index("check_internal_pki.sh") < infrastructure.index("replace_service mqtt")
    assert stateless.index("check_internal_pki.sh") < stateless.index("previous_container_id=")
    assert stateless.index("check_internal_pki.sh") < stateless.index("deployment_complete=0")
