from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_dashboard_control_responsibilities_have_distinct_owners() -> None:
    control = ROOT / "gcs-dashboard/src/features/control"

    assert (control / "api/controlIntentSender.ts").is_file()
    assert (control / "components/RemoteControlPad.tsx").is_file()
    assert (control / "contracts/controlIntent.ts").is_file()
    assert (control / "hooks/useDeadManControl.ts").is_file()
    assert not (control / "RemoteControlPad.tsx").exists()
    assert not (control / "useDeadManControl.ts").exists()
