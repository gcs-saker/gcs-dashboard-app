import json
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/materialize_secret_bundle.py"
UNIT = ROOT / "deploy/systemd/gcs-saker-secret-materialize.service"


def run_materializer(allowlist: Path, output: Path, document: dict) -> subprocess.CompletedProcess[str]:
    optional = allowlist.with_name("optional-allowlist")
    optional.write_text("OPTIONAL_SECRET\n", encoding="utf-8")
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--allowlist",
            str(allowlist),
            "--optional-allowlist",
            str(optional),
            "--output-directory",
            str(output),
        ],
        input=json.dumps(document),
        capture_output=True,
        text=True,
        check=False,
    )


def test_materializer_writes_only_allowlisted_owner_only_files(tmp_path: Path) -> None:
    output = tmp_path / "runtime"
    output.mkdir(mode=0o700)
    allowlist = tmp_path / "allowlist"
    allowlist.write_text("FIRST_SECRET\nSECOND_SECRET\n", encoding="utf-8")
    document = {
        "schemaVersion": "gcs-saker.encrypted-secret-bundle.v1",
        "secrets": {"FIRST_SECRET": "alpha", "SECOND_SECRET": "beta"},
    }

    result = run_materializer(allowlist, output, document)

    assert result.returncode == 0
    assert (output / "FIRST_SECRET").read_text(encoding="utf-8") == "alpha"
    assert stat.S_IMODE((output / "FIRST_SECRET").stat().st_mode) == 0o600


def test_materializer_rejects_unknown_keys_without_echoing_values(tmp_path: Path) -> None:
    output = tmp_path / "runtime"
    output.mkdir(mode=0o700)
    allowlist = tmp_path / "allowlist"
    allowlist.write_text("FIRST_SECRET\n", encoding="utf-8")
    raw_secret = "must-never-appear"
    document = {
        "schemaVersion": "gcs-saker.encrypted-secret-bundle.v1",
        "secrets": {"FIRST_SECRET": "alpha", "UNEXPECTED_SECRET": raw_secret},
    }

    result = run_materializer(allowlist, output, document)

    assert result.returncode == 1
    assert raw_secret not in result.stderr
    assert not list(output.iterdir())


def test_systemd_unit_uses_encrypted_age_credential_and_runtime_directory() -> None:
    source = UNIT.read_text(encoding="utf-8")

    assert "LoadCredentialEncrypted=sops-age-key:" in source
    assert "SOPS_AGE_KEY_FILE=%d/sops-age-key" in source
    assert "RuntimeDirectory=gcs-saker-secrets" in source
    assert "RuntimeDirectoryMode=0700" in source
    assert "DEPLOYMENT_TARGET=server01-production" in source
    assert "/run/gcs-saker-secrets" in source
