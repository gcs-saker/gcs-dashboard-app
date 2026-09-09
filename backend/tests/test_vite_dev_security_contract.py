import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DASHBOARD = ROOT / "gcs-dashboard"


def test_default_vite_dev_server_is_loopback_and_local_only() -> None:
    package = json.loads((DASHBOARD / "package.json").read_text(encoding="utf-8"))
    config = (DASHBOARD / "vite.config.ts").read_text(encoding="utf-8")
    policy = (DASHBOARD / "viteSecurityPolicy.ts").read_text(encoding="utf-8")

    assert package["scripts"]["dev"] == "vite"
    assert package["scripts"]["start"] == "vite"
    assert 'env.VITE_DEV_HOST || "127.0.0.1"' in config
    assert 'LOCAL_DEV_PROXY = "http://127.0.0.1:8080"' in policy
    assert "VITE_ALLOW_PRODUCTION_PROXY" in policy
    assert "VITE_DEV_ALLOW_INSECURE_TLS" in policy
    assert "secure: false" not in config
    assert '|| "https://gcs-saker.com"' not in config
