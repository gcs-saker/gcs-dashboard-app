import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "m7_media_control_cutover_smoke.sh"


def test_m7_media_control_cutover_smoke_contract_check_passes() -> None:
    result = subprocess.run(
        [str(SCRIPT), "--check"],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )

    assert "M7 media-control cutover smoke check passed" in result.stdout


def test_m7_media_control_cutover_smoke_verifies_go_stream_contracts() -> None:
    script = SCRIPT.read_text(encoding="utf-8")

    assert "/media-control/api/v1/streams/ice-servers" in script
    assert "/media-control/api/v1/streams/${STREAM_ID}/playback" in script
    assert "wait_for_media_control_stream" in script
    assert "Verified: Go stream list, detail, playback, status, ICE servers" in script
