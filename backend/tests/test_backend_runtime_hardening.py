from pathlib import Path

DOCKERFILE = Path(__file__).resolve().parents[1] / "Dockerfile"


def test_runtime_removes_package_installers_and_vendored_scanner_findings() -> None:
    source = DOCKERFILE.read_text(encoding="utf-8")

    assert "pip uninstall --yes pip setuptools wheel" in source
    assert "site-packages/pip/_vendor/msgpack" in source
