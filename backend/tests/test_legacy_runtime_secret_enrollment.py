import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/enroll_legacy_runtime_secrets.py"
MATERIALIZER_DIR = ROOT / "scripts/ops"
pytestmark = pytest.mark.skipif(os.name == "nt", reason="POSIX ownership semantics required")


def run_enrollment(
    tmp_path: Path, required: str, primary: str, supplement: str = ""
) -> subprocess.CompletedProcess[str]:
    allowlist = tmp_path / "required"
    optional = tmp_path / "optional"
    primary_env = tmp_path / "primary.env"
    supplement_env = tmp_path / "supplement.env"
    output = tmp_path / "runtime"
    allowlist.write_text(required)
    optional.write_text("OPTIONAL_SECRET\n")
    primary_env.write_text(primary)
    supplement_env.write_text(supplement)
    output.mkdir(mode=0o700)
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--primary-env",
            str(primary_env),
            "--supplement-env",
            str(supplement_env),
            "--allowlist",
            str(allowlist),
            "--optional-allowlist",
            str(optional),
            "--output-directory",
            str(output),
            "--runtime-gid",
            str(os.getgid()),
            "--disable-signup",
            "--generate-mediamtx-password",
        ],
        cwd=MATERIALIZER_DIR,
        text=True,
        capture_output=True,
    )


def test_enrollment_fills_missing_values_without_overriding_primary(tmp_path: Path) -> None:
    result = run_enrollment(
        tmp_path,
        "AUTH_JWT_SECRET\nMEDIA_CONTROL_GRPC_TOKEN\nMEDIAMTX_API_PASSWORD\nAUTH_POLICY_SIGNUP_INVITES\n",
        "AUTH_JWT_SECRET='primary-secret'\n",
        'AUTH_JWT_SECRET="ignored-secret"\nMEDIA_CONTROL_GRPC_TOKEN=supplement-token\n',
    )
    output = tmp_path / "runtime"

    assert result.returncode == 0
    assert (output / "AUTH_JWT_SECRET").read_text() == "primary-secret"
    assert (output / "MEDIA_CONTROL_GRPC_TOKEN").read_text() == "supplement-token"
    assert (output / "AUTH_POLICY_SIGNUP_INVITES").read_text() == "disabled"
    assert len((output / "MEDIAMTX_API_PASSWORD").read_text()) >= 48
    assert stat.S_IMODE((output / "MEDIAMTX_API_PASSWORD").stat().st_mode) == 0o440


def test_enrollment_rejects_missing_required_secret_without_exposing_values(tmp_path: Path) -> None:
    result = run_enrollment(tmp_path, "AUTH_JWT_SECRET\nMISSING_SECRET\n", "AUTH_JWT_SECRET=never-print-me\n")

    assert result.returncode == 1
    assert "never-print-me" not in result.stderr
    assert not list((tmp_path / "runtime").iterdir())


def test_enrollment_refuses_to_replace_managed_secret(tmp_path: Path) -> None:
    output = tmp_path / "runtime"
    output.mkdir(mode=0o700)
    (output / "AUTH_JWT_SECRET").write_text("existing")
    allowlist = tmp_path / "required"
    optional = tmp_path / "optional"
    primary = tmp_path / "primary.env"
    allowlist.write_text("AUTH_JWT_SECRET\n")
    optional.write_text("OPTIONAL_SECRET\n")
    primary.write_text("AUTH_JWT_SECRET=replacement\n")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--primary-env",
            str(primary),
            "--allowlist",
            str(allowlist),
            "--optional-allowlist",
            str(optional),
            "--output-directory",
            str(output),
            "--runtime-gid",
            str(os.getgid()),
        ],
        cwd=MATERIALIZER_DIR,
        text=True,
        capture_output=True,
    )

    assert result.returncode == 1
    assert (output / "AUTH_JWT_SECRET").read_text() == "existing"
