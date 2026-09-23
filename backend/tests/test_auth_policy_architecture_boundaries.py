from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KOTLIN_ROOT = ROOT / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy"
PRODUCTION_LINE_LIMIT = 350


def kotlin_sources(layer: str) -> list[Path]:
    return sorted((KOTLIN_ROOT / layer).rglob("*.kt"))


def imported_layers(source: Path) -> set[str]:
    prefix = "import kr.co.a4ai.gcssaker.authpolicy."
    return {
        line.removeprefix(prefix).split(".", maxsplit=1)[0]
        for line in source.read_text(encoding="utf-8").splitlines()
        if line.startswith(prefix)
    }


def assert_no_imports(layer: str, forbidden: set[str]) -> None:
    offenders = [
        source.relative_to(KOTLIN_ROOT).as_posix()
        for source in kotlin_sources(layer)
        if imported_layers(source) & forbidden
    ]
    assert offenders == []


def test_domain_has_no_inward_dependency_on_outer_layers() -> None:
    assert_no_imports(
        "domain",
        {"api", "application", "configuration", "infrastructure", "observability"},
    )


def test_application_does_not_depend_on_delivery_or_infrastructure() -> None:
    assert_no_imports("application", {"api", "configuration", "infrastructure"})


def test_infrastructure_does_not_depend_on_api_delivery() -> None:
    assert_no_imports("infrastructure", {"api"})


def test_auth_policy_production_files_stay_within_size_limit() -> None:
    offenders = [
        source.relative_to(KOTLIN_ROOT).as_posix()
        for source in KOTLIN_ROOT.rglob("*.kt")
        if len(source.read_text(encoding="utf-8").splitlines()) > PRODUCTION_LINE_LIMIT
    ]
    assert offenders == []
