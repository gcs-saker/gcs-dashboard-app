import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/refresh_internal_crl.sh"


def command(*parts: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> str:
    return subprocess.run(parts, cwd=cwd, env=env, check=True, text=True, capture_output=True).stdout.strip()


@pytest.mark.skipif(shutil.which("bash") is None or shutil.which("openssl") is None, reason="bash and openssl required")
def test_refresh_overrides_legacy_seven_day_ca_config_with_bounded_thirty_day_crl(tmp_path: Path) -> None:
    pki = tmp_path / "pki"
    pki.mkdir(mode=0o700)
    (pki / "newcerts").mkdir()
    (pki / "index.txt").write_text("")
    (pki / "serial").write_text("1000\n")
    (pki / "crlnumber").write_text("1000\n")
    command(
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-subj",
        "/CN=Fixture CA",
        "-keyout",
        str(pki / "ca.key"),
        "-out",
        str(pki / "ca.crt"),
        "-days",
        "365",
        cwd=pki,
    )
    (pki / "openssl-ca.cnf").write_text(f"""[ca]
default_ca=CA_default
[CA_default]
dir={pki}
database=$dir/index.txt
new_certs_dir=$dir/newcerts
certificate=$dir/ca.crt
private_key=$dir/ca.key
serial=$dir/serial
crlnumber=$dir/crlnumber
default_md=sha256
default_crl_days=7
""")
    os.chmod(pki / "ca.key", 0o600)
    env = os.environ | {"PKI_CRL_VALIDITY_DAYS": "30", "PKI_CRL_MIN_VALIDITY_SECONDS": "1209600"}
    command("bash", str(SCRIPT), str(pki), env=env)
    next_update = command("openssl", "crl", "-in", str(pki / "ca.crl"), "-noout", "-nextupdate")
    expiry = datetime.strptime(next_update.removeprefix("nextUpdate="), "%b %d %H:%M:%S %Y %Z").replace(
        tzinfo=timezone.utc
    )
    remaining_days = (expiry - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 28 <= remaining_days <= 31
    assert (pki / "ca.crl").stat().st_mode & 0o777 == 0o644


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
@pytest.mark.parametrize("days", ["0", "13", "366", "invalid"])
def test_refresh_rejects_out_of_policy_validity_before_ca_access(tmp_path: Path, days: str) -> None:
    pki = tmp_path / "pki"
    pki.mkdir()
    result = subprocess.run(
        ["bash", str(SCRIPT), str(pki)],
        env=os.environ | {"PKI_CRL_VALIDITY_DAYS": days},
        text=True,
        capture_output=True,
    )
    assert result.returncode == 2
    assert "CRL validity days must be between 14 and 365" in result.stderr
