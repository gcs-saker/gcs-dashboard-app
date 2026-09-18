from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/identity/AuthRequestGuard.kt"
OVERRIDE = ROOT / "deploy/compose/compose.auth-policy-smoke.override.yml"


def test_stale_access_security_version_is_translated_to_unauthorized() -> None:
    source = GUARD.read_text(encoding="utf-8")

    assert 'error.message == "access token security version is stale"' in source
    assert "throw UnauthorizedApiError(AuthApiErrors.INVALID_TOKEN)" in source
    assert "throw error" in source


def test_auth_smoke_override_is_loopback_only() -> None:
    source = OVERRIDE.read_text(encoding="utf-8")

    assert "${AUTH_POLICY_SMOKE_BIND_ADDR:-127.0.0.1}" in source
    assert "${AUTH_POLICY_SMOKE_PORT:-28080}:8080" in source
