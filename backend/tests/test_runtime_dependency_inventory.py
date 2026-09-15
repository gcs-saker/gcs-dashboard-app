from pathlib import Path

RUNTIME_REQUIREMENTS = Path(__file__).resolve().parents[1] / "requirements-runtime.txt"
REMOVED_NON_RUNTIME_PACKAGES = {
    "cryptography",
    "flask",
    "pycryptodome",
    "python-multipart",
    "pytz",
    "requests",
}


def test_runtime_inventory_excludes_unused_packages() -> None:
    declared = {
        line.partition("==")[0].lower()
        for line in RUNTIME_REQUIREMENTS.read_text(encoding="utf-8").splitlines()
        if line and not line.startswith("#")
    }

    assert declared.isdisjoint(REMOVED_NON_RUNTIME_PACKAGES)
