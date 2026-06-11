import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "server_udp_tuning_check.sh"
DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_udp_conntrack_tuning.md"


def test_server_udp_tuning_check_script_is_valid_bash() -> None:
    result = subprocess.run(
        ["bash", "-n", str(SCRIPT)],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_server_udp_tuning_check_script_covers_webrtc_udp_bottlenecks() -> None:
    content = SCRIPT.read_text(encoding="utf-8")

    required_phrases = [
        "net.core.rmem_max",
        "net.core.wmem_max",
        "net.netfilter.nf_conntrack_max",
        "net.ipv4.ip_local_port_range",
        "RECOMMENDED_EPHEMERAL_PORT_WIDTH",
    ]
    for phrase in required_phrases:
        assert phrase in content


def test_udp_conntrack_tuning_doc_explains_risk_and_apply_order() -> None:
    content = DOC.read_text(encoding="utf-8")

    required_phrases = [
        "값을 변경하지 않고",
        "TURN relay port range",
        "sudo sysctl --system",
        "conntrack 값을 올리면 메모리 사용량도 증가",
    ]
    for phrase in required_phrases:
        assert phrase in content
