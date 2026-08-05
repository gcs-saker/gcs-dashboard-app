import importlib.util
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "m7_external_nat_webrtc_smoke.sh"
PUBLISHER_SCRIPT = REPO_ROOT / "scripts" / "smoke" / "webrtc_whip_publish_smoke.py"
DOC = REPO_ROOT / "docs" / "operations" / "GCS-Saker_M7_external_nat_webrtc_validation.md"


def load_publish_module():
    spec = importlib.util.spec_from_file_location("webrtc_whip_publish_smoke", PUBLISHER_SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_m7_external_nat_webrtc_smoke_contract_check_passes() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 external NAT WebRTC smoke check passed" in result.stdout


def test_m7_external_nat_webrtc_smoke_reports_required_metrics() -> None:
    script = SCRIPT.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")

    assert "TURN primary" in script
    assert "TURN secondary" in script
    assert "AUTH_BEARER_TOKEN" in script
    assert "resolve_publish_whip_url" in script
    assert "resolve_playback_whep_url" in script
    assert "authorized WHEP playback URL resolved through media-control" in script
    assert "authorized WHIP publish URL resolved through media-control" in script
    assert "Security gate: WHIP publish URL was issued by media-control authorization" in script
    assert "ice server API auth gate: enforced" in script
    assert "RELAY_ONLY" in script
    assert "--require-video-frame" in script
    assert "--measure-audio-video-sync" in script
    assert "candidate summary" in script
    assert "WHEP_RETRY_COUNT" in script
    assert 'printf \'%s\\n\' "$output" >>"$REPORT_FILE"' in script
    assert "waiting for WHIP path visibility" in script
    assert "External NAT smoke wall latency ms" in script
    assert "first-frame latency" in doc
    assert "audio/video sync offset" in doc
    assert "UDP 제한/relay-only" in doc


def test_webrtc_whip_publish_smoke_check_passes_without_aiortc() -> None:
    result = subprocess.run(
        [str(PUBLISHER_SCRIPT), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "WebRTC WHIP publish smoke check passed" in result.stdout
    assert "synthetic yuv420p video and Opus audio tracks" in result.stdout


def test_webrtc_whip_publish_smoke_redacts_media_token_query() -> None:
    module = load_publish_module()

    redacted = module.redact_url_query("https://edge.example/webrtc/raw/nat/smoke/whip?publisherToken=secret")

    assert redacted == "https://edge.example/webrtc/raw/nat/smoke/whip?<redacted-query>"
    assert "secret" not in redacted
