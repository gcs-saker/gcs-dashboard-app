import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/smoke/control_command_e2e.sh"


def test_control_command_e2e_contract_check_passes() -> None:
    result = subprocess.run(["bash", str(SCRIPT), "--check"], cwd=ROOT, check=True, capture_output=True, text=True)

    assert "control command E2E contract check passed" in result.stdout


def test_control_command_e2e_covers_required_boundaries() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "--tests kr.co.a4ai.gcssaker.authpolicy.domain.ControlLeasePolicyTest" in source
    assert "domain.control.ControlLeasePolicyTest" not in source
    assert "TestControlCommandE2E" in source
    assert "amazoncorretto:21@sha256:a02f509af88bd1544d5bb42be83a20d9022dc15f388a0007e2c7d0d87170b9f4" in source
    assert "CONTRACTS_PROTO_DIR=/tmp/contracts/proto java -classpath gradle/wrapper/gradle-wrapper.jar" in source
    assert "org.gradle.wrapper.GradleWrapperMain --no-daemon test" in source
    assert "gradle:8.14.3-jdk21" not in source
    assert (
        "go test -race ./internal/controltransport ./internal/controlstate ./internal/controlobs ./internal/deviceadapter"
        in source
    )
    assert (
        "policy denials, routing, lease, duplicate, sequence, expiry, ACK, fail-safe, emergency-stop, leakage" in source
    )
