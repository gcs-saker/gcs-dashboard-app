from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE = REPO_ROOT / "docs/compliance/security/security-testing-profile.yml"


def test_security_testing_profile_tracks_implemented_and_unrun_work_separately() -> None:
    profile = yaml.safe_load(PROFILE.read_text(encoding="utf-8"))

    assert profile["fuzzing"]["pullRequestSeeds"]["status"] == "IMPLEMENTED"
    assert profile["fuzzing"]["scheduledCampaign"]["status"] == "IMPLEMENTED"
    assert profile["dynamic"]["dast"]["status"] == "NOT_RUN"
    assert profile["dynamic"]["penetrationTest"]["status"] == "NOT_RUN"
    assert "authorization bypass" in profile["failureConditions"]


def test_fuzz_targets_exist_in_owned_boundary_packages() -> None:
    targets = {
        "FuzzParseStreamID": REPO_ROOT / "services/media-control/internal/domain/stream_path_fuzz_test.go",
        "FuzzValidateForRoute": REPO_ROOT / "services/media-control/internal/sessiontoken/token_fuzz_test.go",
        "FuzzMissionWaypointBoundary": REPO_ROOT / "services/media-control/internal/mission/mission_fuzz_test.go",
    }
    for name, path in targets.items():
        assert f"func {name}" in path.read_text(encoding="utf-8")

