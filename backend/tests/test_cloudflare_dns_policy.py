from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[2]
POLICY_DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_Cloudflare_DNS_DDNS_정책_v0.1.md"


def read_policy() -> str:
    return POLICY_DOC.read_text(encoding="utf-8")


def test_cloudflare_dns_policy_document_exists() -> None:
    assert POLICY_DOC.is_file()


def test_domain_roles_are_separated_with_proxy_modes() -> None:
    doc = read_policy()

    assert table_proxy_mode(doc, "dashboard") == "ON"
    assert table_proxy_mode(doc, "api") == "ON"
    assert table_proxy_mode(doc, "media") == "DNS-only"
    assert table_proxy_mode(doc, "turn") == "DNS-only"


def test_policy_explains_webrtc_sensitive_proxy_boundaries() -> None:
    doc = read_policy()

    for term in [
        "WebRTC WHEP signaling은 HTTP(S)",
        "WebRTC ICE UDP/TCP media path, STUN, TURN은 Cloudflare HTTP proxy 대상이 아니다",
        "WebRTC ICE candidate가 해당 hostname의 Cloudflare proxy IP를 media endpoint로 사용하지 않는다",
        "Cloudflare proxy ON 도메인을 WebRTC ICE media endpoint로 사용하면",
    ]:
        assert term in doc


def test_policy_documents_ddns_update_and_secret_boundaries() -> None:
    doc = read_policy()

    for term in [
        "Cloudflare API token은 DNS edit 범위로 최소화한다",
        "token, zone id, record id, origin IP 원문은 공개 이슈/PR에 남기지 않는다",
        "DDNS token, zone id, record id가 GitHub에 저장되지 않았는지 확인한다",
    ]:
        assert term in doc


def test_policy_contains_dns_and_runtime_check_commands() -> None:
    doc = read_policy()

    for command in [
        "dig +short gcs.example.invalid",
        "curl -I https://gcs.example.invalid/",
        "curl -I https://api.gcs.example.invalid/api/v1/streams/status",
        "openssl s_client -connect gcs.example.invalid:443",
        "nc -vz media.gcs.example.invalid 8189",
        "turnutils_uclient",
    ]:
        assert command in doc


def test_policy_contains_pre_and_post_deployment_checklists() -> None:
    doc = read_policy()

    assert "배포 전 검증 절차" in doc
    assert "배포 후 검증 절차" in doc
    assert len(re.findall(r"^- \[ \]", doc, flags=re.MULTILINE)) >= 14


def test_policy_uses_placeholders_instead_of_real_infra_values() -> None:
    doc = read_policy()

    assert "example.invalid" in doc
    assert "tplinkdns" not in doc.lower()
    assert "165.229." not in doc


def table_proxy_mode(doc: str, role: str) -> str:
    pattern = rf"^\| {re.escape(role)} \| [^|]+ \| (?P<mode>[^|]+) \|"
    match = re.search(pattern, doc, flags=re.MULTILINE)
    assert match is not None, f"{role} domain policy not found"
    return match.group("mode").strip()
