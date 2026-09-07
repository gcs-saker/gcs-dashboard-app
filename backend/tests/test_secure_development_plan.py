from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PLAN = REPO_ROOT / "docs/compliance/security/secure-development-plan.md"
PR_TEMPLATE = REPO_ROOT / ".github/pull_request_template.md"
CODEOWNERS = REPO_ROOT / ".github/CODEOWNERS"


def test_secure_development_plan_maps_every_ssdf_practice_group() -> None:
    plan = PLAN.read_text(encoding="utf-8")

    assert all(heading in plan for heading in ("## PO", "## PS", "## PW", "## RV"))
    assert "ISO/IEC/IEEE 12207" in plan
    assert "manifest-plus-artifact" in plan
    assert "Every exception names" in plan


def test_security_sensitive_pull_requests_require_complete_impact_context() -> None:
    template = PR_TEMPLATE.read_text(encoding="utf-8")

    required_prompts = (
        "Changed trust boundary",
        "Attacker-controlled inputs",
        "Data classification",
        "key-lifecycle impact",
        "supply-chain impact",
        "Threat/hazard requirement IDs",
        "Negative, malformed, replay, and cross-scope tests",
    )
    assert all(prompt in template for prompt in required_prompts)


def test_security_owned_boundaries_have_codeowners() -> None:
    owners = CODEOWNERS.read_text(encoding="utf-8")

    for path in (
        "/services/auth-policy/",
        "/services/media-control/",
        "/contracts/",
        "/scripts/gates/",
        "/docs/compliance/",
        "/.github/CODEOWNERS",
    ):
        assert f"{path} @taetaehoo" in owners


def test_ai_assistance_cannot_bypass_security_or_evidence_requirements() -> None:
    plan = PLAN.read_text(encoding="utf-8")

    assert "Never provide operational secrets" in plan
    assert "Treat generated source" in plan
    assert "AI-generated tests cannot be the sole evidence" in plan
