import argparse
import json
import runpy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/recovery_qualification.py"
MODULE = runpy.run_path(str(SCRIPT))
RecoveryQualificationError = cast(type[BaseException], MODULE["RecoveryQualificationError"])
load_document = cast(Callable[[Path], dict[str, Any]], MODULE["load_document"])
validate_profile = cast(Callable[[dict[str, Any]], dict[str, dict[str, Any]]], MODULE["validate_profile"])
reconcile_records = cast(Callable[[list[str], list[str]], dict[str, Any]], MODULE["reconcile_records"])
evaluate_recovery = cast(Callable[..., str], MODULE["evaluate_recovery"])
verify_backup = cast(Callable[[Path, str], str], MODULE["verify_backup"])
validate_execution = cast(Callable[[argparse.Namespace, str], str], MODULE["validate_execution"])
write_immutable = cast(Callable[[Path, dict[str, Any]], None], MODULE["write_immutable"])
PROFILE = ROOT / "docs/compliance/quality/recovery-qualification-profile.yml"


def test_recovery_profile_covers_controlled_services() -> None:
    scenarios = validate_profile(load_document(PROFILE))

    assert set(scenarios) == {
        "RQ-POSTGRES",
        "RQ-REDIS",
        "RQ-MQTT",
        "RQ-MEDIAMTX",
        "RQ-AUTH-POLICY",
        "RQ-MEDIA-CONTROL",
    }


def test_clean_reconciliation_is_technically_successful_but_not_approved() -> None:
    result = reconcile_records(["one", "two"], ["two", "one"])

    assert result["technicalResult"] == "PASS"
    assert result["unrecoverableAcceptedRecords"] == 0
    assert result["verdict"] == "BLOCKED"


def test_reconciliation_detects_missing_duplicate_and_unexpected_records() -> None:
    result = reconcile_records(["one", "two"], ["one", "one", "three"])

    assert result["missingIds"] == ["two"]
    assert result["duplicateIds"] == ["one"]
    assert result["unexpectedIds"] == ["three"]
    assert result["verdict"] == "FAIL"


def test_duplicate_accepted_ids_are_rejected() -> None:
    with pytest.raises(RecoveryQualificationError, match="must be unique"):
        reconcile_records(["one", "one"], ["one"])


def test_invalid_recovered_ids_are_rejected() -> None:
    with pytest.raises(RecoveryQualificationError, match="recovered IDs"):
        reconcile_records(["one"], [""])


@pytest.mark.parametrize(
    ("fault_observed", "container_preserved", "probes_passed", "duration", "expected"),
    [
        (True, True, True, 120.0, "PASS"),
        (False, True, True, 1.0, "FAIL"),
        (True, False, True, 1.0, "FAIL"),
        (True, True, False, 1.0, "FAIL"),
        (True, True, True, 120.1, "FAIL"),
    ],
)
def test_recovery_verdict_enforces_every_invariant(
    fault_observed: bool,
    container_preserved: bool,
    probes_passed: bool,
    duration: float,
    expected: str,
) -> None:
    probes = [{"passed": probes_passed}]

    assert (
        evaluate_recovery(
            fault_observed=fault_observed,
            container_preserved=container_preserved,
            post_probes=probes,
            duration=duration,
            rto=120,
        )
        == expected
    )


def test_backup_must_match_commit_and_prove_restore(tmp_path: Path) -> None:
    backup = tmp_path / "backup.json"
    backup.write_text(
        json.dumps(
            {
                "sourceCommit": "a" * 40,
                "restoreVerified": True,
                "databaseDumpSha256": "b" * 64,
            }
        ),
        encoding="utf-8",
    )

    assert len(verify_backup(backup, "a" * 40)) == 64
    with pytest.raises(RecoveryQualificationError, match="another commit"):
        verify_backup(backup, "c" * 40)


def test_execution_rejects_non_production_target(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEPLOYMENT_TARGET", "server01-production")
    args = argparse.Namespace(target="server02", approved_window="window", project_name="gcs-saker-m2-production")

    with pytest.raises(RecoveryQualificationError, match="Server-01"):
        validate_execution(args, "a" * 40)


def test_immutable_evidence_cannot_be_overwritten(tmp_path: Path) -> None:
    output = tmp_path / "result.json"
    write_immutable(output, {"verdict": "BLOCKED"})

    with pytest.raises(FileExistsError):
        write_immutable(output, {"verdict": "PASS"})
