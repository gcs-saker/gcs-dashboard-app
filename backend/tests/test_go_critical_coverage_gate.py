import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/gates/go_critical_coverage.sh"


def test_go_coverage_gate_has_valid_shell_syntax() -> None:
    subprocess.run(["bash", "-n", str(SCRIPT)], cwd=ROOT, check=True)


def test_go_coverage_gate_covers_security_critical_low_coverage_packages() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "./internal/sessiontoken 80" in source
    assert "./internal/mqttgateway 30" in source
    assert "go test -coverprofile=" in source
    assert "go tool cover -func=" in source
