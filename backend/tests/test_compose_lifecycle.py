import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ops/compose_lifecycle.py"


def load_module():
    spec = importlib.util.spec_from_file_location("compose_lifecycle", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def config(module, tmp_path: Path):
    compose = tmp_path / "compose.yml"
    environment = tmp_path / "runtime.env"
    compose.write_text("services: {}\n")
    environment.write_text("SAFE=1\n")
    return module.LifecycleConfig(compose, environment, "gcs-saker-m2-production", "server01-production", 10, 0.1)


class FakeRunner:
    def __init__(self, module, tmp_path: Path, *, missing: str | None = None) -> None:
        secret = tmp_path / "secret"
        secret.write_text("value")
        pki = tmp_path / "pki"
        pki.mkdir()
        (pki / "ca.crl").write_text("fixture")
        self.rendered = json.dumps(
            {
                "secrets": {"required": {"file": str(secret)}},
                "services": {"mqtt": {"volumes": [{"source": str(pki), "target": "/run/secrets/gcs-pki"}]}},
            },
        )
        self.module = module
        self.missing = missing
        self.commands: list[list[str]] = []

    def run(self, command: list[str], timeout: int = 60) -> str:
        self.commands.append(command)
        if "config" in command:
            return self.rendered
        if "ps" in command:
            service = command[-1]
            return "" if service == self.missing else f"container-{service}"
        if command[:2] == ["docker", "inspect"]:
            service = command[-1].removeprefix("container-")
            return dict(self.module.START_PHASES)[service]
        return ""


def test_plans_are_sequential_and_stop_in_reverse_order() -> None:
    module = load_module()

    start = module.plan("start")["services"]
    stop = module.plan("stop")["services"]

    assert start[:3] == ["postgres-geo", "redis", "mqtt"]
    assert start[-1] == "edge"
    assert stop == list(reversed(start))


def test_start_uses_existing_containers_without_recreate(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    module = load_module()
    runner = FakeRunner(module, tmp_path)
    lifecycle = module.ComposeLifecycle(config(module, tmp_path), runner, sleep=lambda _: None)

    lifecycle.start()

    starts = [command[-1] for command in runner.commands if "start" in command]
    events = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    assert starts == [service for service, _ in module.START_PHASES]
    assert not any("up" in command for command in runner.commands)
    assert all(event["durationMs"] >= 0 and event["errorCode"] == "none" for event in events)


def test_start_fails_closed_when_stateful_container_is_absent(tmp_path: Path) -> None:
    module = load_module()
    runner = FakeRunner(module, tmp_path, missing="redis")
    lifecycle = module.ComposeLifecycle(config(module, tmp_path), runner, sleep=lambda _: None)

    with pytest.raises(module.LifecycleError, match="stateful service is absent: redis"):
        lifecycle.start()

    assert not any(command[-2:] == ["start", "redis"] for command in runner.commands)


def test_check_rejects_missing_secret_file(tmp_path: Path) -> None:
    module = load_module()
    runner = FakeRunner(module, tmp_path)
    runner.rendered = json.dumps({"secrets": {"required": {"file": str(tmp_path / "missing")}}})
    lifecycle = module.ComposeLifecycle(config(module, tmp_path), runner)

    with pytest.raises(module.LifecycleError, match="runtime secret file is unavailable"):
        lifecycle.check()


def test_check_rejects_missing_pki_source(tmp_path: Path) -> None:
    module = load_module()
    runner = FakeRunner(module, tmp_path)
    rendered = json.loads(runner.rendered)
    rendered["services"]["mqtt"]["volumes"][0]["source"] = str(tmp_path / "missing-pki")
    runner.rendered = json.dumps(rendered)
    lifecycle = module.ComposeLifecycle(config(module, tmp_path), runner)

    with pytest.raises(module.LifecycleError, match="internal PKI source is unavailable"):
        lifecycle.check()
