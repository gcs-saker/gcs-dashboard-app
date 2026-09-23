import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
MEDIA_INTERNAL = ROOT / "services/media-control/internal"
GO_INTERNAL_IMPORT = re.compile(r'"github\.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/([^/\"]+)')
PYTHON_IMPORT = re.compile(r"^(?:from|import)\s+([a-zA-Z_][\w.]*)", re.MULTILINE)


def python_import_roots(directory: Path) -> dict[str, set[str]]:
    return {
        source.relative_to(BACKEND).as_posix(): {
            match.group(1).split(".", maxsplit=1)[0]
            for match in PYTHON_IMPORT.finditer(source.read_text(encoding="utf-8"))
        }
        for source in directory.rglob("*.py")
    }


def test_media_control_internal_packages_do_not_depend_on_http_delivery() -> None:
    offenders = [
        source.relative_to(MEDIA_INTERNAL).as_posix()
        for source in MEDIA_INTERNAL.rglob("*.go")
        if source.parent != MEDIA_INTERNAL / "httpapi"
        and "httpapi" in GO_INTERNAL_IMPORT.findall(source.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_http_delivery_does_not_import_owned_infrastructure_adapters() -> None:
    forbidden = {"controllease", "controltransport", "mqttgateway", "sessionstore", "streamcache"}
    offenders = [
        source.relative_to(MEDIA_INTERNAL).as_posix()
        for source in (MEDIA_INTERNAL / "httpapi").glob("*.go")
        if forbidden & set(GO_INTERNAL_IMPORT.findall(source.read_text(encoding="utf-8")))
    ]
    assert offenders == []


def test_backend_core_has_no_dependency_on_delivery_or_adapters() -> None:
    offenders = [
        path for path, imports in python_import_roots(BACKEND / "core").items() if imports & {"api", "modules", "mqtt"}
    ]
    assert offenders == []


def test_backend_domain_and_adapters_do_not_import_api_delivery() -> None:
    sources = {
        **python_import_roots(BACKEND / "model"),
        **python_import_roots(BACKEND / "modules"),
        **python_import_roots(BACKEND / "mqtt"),
    }
    offenders = [path for path, imports in sources.items() if "api" in imports]
    assert offenders == []
