from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_control_application_is_not_owned_by_http_transport() -> None:
    assert (ROOT / "services/media-control/internal/controlapp/application.go").is_file()
    assert not (ROOT / "services/media-control/internal/httpapi/control_application.go").exists()


def test_kotlin_domain_package_matches_physical_owner() -> None:
    source = ROOT / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/domain/ControlLeasePolicy.kt"

    assert source.is_file()
    assert source.read_text(encoding="utf-8").startswith("package kr.co.a4ai.gcssaker.authpolicy.domain\n")
    assert not (source.parent / "control/ControlLeasePolicy.kt").exists()


def test_control_route_and_lease_have_single_owned_packages() -> None:
    media = ROOT / "services/media-control/internal"

    assert (media / "controlroute/resolver.go").is_file()
    assert (media / "controllease/redis_store.go").is_file()
    assert not (media / "controlsession/route.go").exists()
    assert not (media / "controlsession/redis_lease.go").exists()
