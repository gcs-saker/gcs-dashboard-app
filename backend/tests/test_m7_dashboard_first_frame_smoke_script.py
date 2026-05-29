import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_m7_dashboard_first_frame_smoke_contract_check_passes():
    result = subprocess.run(
        ["bash", str(REPO_ROOT / "scripts" / "m7_dashboard_first_frame_smoke.sh"), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 dashboard first-frame smoke check passed" in result.stdout


def test_m7_smoke_user_seed_script_documents_default_user():
    script = (REPO_ROOT / "scripts" / "m7_seed_smoke_user.py").read_text(encoding="utf-8")

    assert "m7-smoke-viewer" in script
    assert "m7-smoke-pass" in script
    assert "Base.metadata.create_all" in script


def test_m7_dashboard_smoke_validates_authenticated_playback_edge_url():
    script = (REPO_ROOT / "scripts" / "m7_dashboard_first_frame_smoke.sh").read_text(encoding="utf-8")

    assert "/api/v1/streams/${SMOKE_STREAM_ID}/playback" in script
    assert 'payload["playbackUrls"]' in script
    assert 'f"{edge_base_url}/webrtc/"' in script
    assert 'f"{edge_base_url}/hls/"' in script
