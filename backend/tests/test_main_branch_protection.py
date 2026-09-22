import importlib.util
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/github/verify_main_branch_protection.py"


def load_module():
    spec = importlib.util.spec_from_file_location("verify_main_branch_protection", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_payload():
    return {
        "required_status_checks": {"strict": True, "contexts": sorted(load_module().REQUIRED_CHECKS)},
        "required_pull_request_reviews": {"required_approving_review_count": 0},
        "enforce_admins": {"enabled": True},
        "required_conversation_resolution": {"enabled": True},
        "allow_force_pushes": {"enabled": False},
        "allow_deletions": {"enabled": False},
    }


def test_valid_main_protection_passes():
    assert load_module().validate_protection(valid_payload()) == []


def test_missing_check_and_admin_bypass_fail_closed():
    module = load_module()
    payload = valid_payload()
    payload["required_status_checks"]["contexts"].remove("backend-test")
    payload["enforce_admins"]["enabled"] = False

    failures = module.validate_protection(payload)

    assert "missing required checks: backend-test" in failures
    assert "enforce_admins must be enabled" in failures
