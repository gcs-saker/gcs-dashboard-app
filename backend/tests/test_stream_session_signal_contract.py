from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_stream_session_sse_uses_signal_and_low_frequency_fallback() -> None:
    controller = (
        ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/operations/reads/OperationalReadController.kt"
    ).read_text(encoding="utf-8")
    contract = (
        ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/operations/reads/OperationalReadStreamContract.kt"
    ).read_text(encoding="utf-8")

    assert "streamSessionSignal.publish()" in controller
    assert "streamSessionSignal.awaitChange" in controller
    assert "TimeUnit.MILLISECONDS.sleep" not in controller
    assert "DEFAULT_POLL_INTERVAL_MILLIS = 15_000L" in contract
