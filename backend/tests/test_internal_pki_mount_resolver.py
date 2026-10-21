import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RESOLVER = ROOT / "scripts/ops/resolve_internal_pki_mount.sh"


def run_resolver(tmp_path: Path, source: Path) -> subprocess.CompletedProcess[str]:
    fake_docker = tmp_path / "docker"
    fake_docker.write_text("#!/usr/bin/env bash\nprintf '%s\\n' \"${FAKE_INSPECT_OUTPUT:-}\"\n")
    fake_docker.chmod(0o700)
    return subprocess.run(
        ["bash", str(RESOLVER), "mqtt-fixture"],
        env=os.environ | {"DOCKER_BIN": str(fake_docker), "FAKE_INSPECT_OUTPUT": str(source)},
        text=True,
        capture_output=True,
    )


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_resolver_accepts_directory_mount(tmp_path: Path) -> None:
    pki = tmp_path / "pki"
    pki.mkdir()
    (pki / "ca.crl").write_text("fixture")

    result = run_resolver(tmp_path, pki)

    assert result.returncode == 0
    assert result.stdout.strip() == str(pki)


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_resolver_accepts_legacy_file_mount(tmp_path: Path) -> None:
    pki = tmp_path / "pki"
    pki.mkdir()
    crl = pki / "ca.crl"
    crl.write_text("fixture")

    result = run_resolver(tmp_path, crl)

    assert result.returncode == 0
    assert result.stdout.strip() == str(pki)


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash required")
def test_resolver_rejects_missing_crl(tmp_path: Path) -> None:
    pki = tmp_path / "pki"
    pki.mkdir()

    result = run_resolver(tmp_path, pki)

    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr.strip() == "MQTT CRL source is unavailable"
