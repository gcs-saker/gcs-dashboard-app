from pathlib import Path
import re

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
POLICY_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_TP-Link_포트포워딩_정책_v0.1.md"
DOCKER_COMPOSE = REPO_ROOT / "gcs-dashboard" / "docker-compose.yml"


def read_policy() -> str:
    return POLICY_DOC.read_text(encoding="utf-8")


def load_compose() -> dict:
    with DOCKER_COMPOSE.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def test_port_forwarding_policy_document_exists() -> None:
    assert POLICY_DOC.is_file()


def test_policy_separates_public_conditional_and_private_ports() -> None:
    doc = read_policy()

    assert table_policy(doc, "443", "tcp") == "외부 공개"
    assert table_policy(doc, "80", "tcp") == "조건부 공개"
    assert table_policy(doc, "8189", "udp") == "조건부 공개"
    assert table_policy(doc, "8189", "tcp") == "조건부 공개"
    assert table_policy(doc, "8890", "udp") == "조건부 공개"
    assert table_policy(doc, "8889", "tcp") == "직접 공개 금지"
    assert table_policy(doc, "8888", "tcp") == "직접 공개 금지"
    assert table_policy(doc, "8554", "tcp") == "외부 공개 금지"
    assert table_policy(doc, "1935", "tcp") == "외부 공개 금지"
    assert table_policy(doc, "9997", "tcp") == "외부 공개 금지"
    assert table_policy(doc, "9998", "tcp") == "외부 공개 금지"


def test_policy_documents_webrtc_hls_stun_turn_decisions() -> None:
    doc = read_policy()

    for term in [
        "WebRTC",
        "HLS",
        "STUN",
        "TURN",
        "WHEP signaling",
        "ICE media path",
        "M5 coturn",
        "STUN은 NAT 후보 수집을 돕지만 암호화를 담당하지 않는다",
        "TURN relay port range는 M5에서 부하 테스트와 함께 확정한다",
    ]:
        assert term in doc


def test_policy_keeps_mediamtx_management_ports_out_of_external_forwarding() -> None:
    doc = read_policy()

    assert "MediaMTX API `9997`과 metrics `9998`은 외부에 포트포워딩하지 않는다" in doc
    assert "`9997/tcp`, `9998/tcp`는 외부 포트포워딩에 등록하지 않는다" in doc


def test_policy_contains_pre_deployment_checklist() -> None:
    doc = read_policy()

    checklist_items = re.findall(r"^- \[ \]", doc, flags=re.MULTILINE)
    assert len(checklist_items) >= 8
    assert "배포 전 점검 체크리스트" in doc
    assert "TP-Link rule snapshot" in doc
    assert "compose/env snapshot" in doc


def test_compose_does_not_publish_management_ports_documented_as_private() -> None:
    compose = load_compose()
    ports = compose["services"]["mediamtx"].get("ports", [])

    assert not any("9997" in port for port in ports)
    assert not any("9998" in port for port in ports)


def table_policy(doc: str, port: str, protocol: str) -> str:
    pattern = rf"^\| `{re.escape(port)}` \| `{re.escape(protocol)}` \| (?P<policy>[^|]+) \|"
    match = re.search(pattern, doc, flags=re.MULTILINE)
    assert match is not None, f"{port}/{protocol} policy not found"
    return match.group("policy").strip()
