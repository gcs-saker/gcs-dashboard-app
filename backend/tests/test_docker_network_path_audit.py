import importlib.util
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
AUDIT = ROOT / "scripts/ops/docker_network_path_audit.py"
BENCHMARK = ROOT / "scripts/benchmarks/docker_network_path_benchmark.py"
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"
POLICY = ROOT / "deploy/network/runtime-path-policy.json"


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_source_compose_matches_runtime_path_policy() -> None:
    module = load(AUDIT, "network_audit")
    compose = yaml.safe_load(COMPOSE.read_text())
    checks = module.audit(compose, module.load_policy(POLICY))

    assert all(check.status == "PASS" for check in checks)


def test_audit_detects_cross_plane_membership_and_management_publish() -> None:
    module = load(AUDIT, "network_audit_negative")
    compose = yaml.safe_load(COMPOSE.read_text())
    compose["services"]["dashboard"]["networks"].append("control-net")
    compose["services"]["mqtt"]["ports"] = [{"target": 8883, "published": 8883}]
    checks = {check.name: check for check in module.audit(compose, module.load_policy(POLICY))}

    assert checks["network.memberships"].status == "FAIL"
    assert checks["network.denied_peers"].status == "FAIL"
    assert checks["network.published_ports"].status == "FAIL"


def test_benchmark_is_local_only_bounded_and_hardened() -> None:
    module = load(BENCHMARK, "network_benchmark")
    module.validate("mqtt", 8883, 100, "gcs-net-fixture-a", "local-fixture")
    command = module.command("mqtt", 8883, 30, "gcs-net-fixture-a")

    assert "--read-only" in command
    assert command[command.index("--cap-drop") + 1] == "ALL"
    assert "@sha256:" in module.PROBE_IMAGE


def test_benchmark_rejects_production_and_sample_overflow() -> None:
    module = load(BENCHMARK, "network_benchmark_boundaries")

    for samples, target in ((1, "server01-production"), (101, "local-fixture")):
        try:
            module.validate("mqtt", 8883, samples, "gcs-net-fixture-a", target)
        except ValueError:
            continue
        raise AssertionError("unsafe benchmark input was accepted")


def test_percentiles_use_nearest_rank() -> None:
    module = load(BENCHMARK, "network_benchmark_percentile")
    payload = {"dnsMs": [1, 2, 3, 4], "connectMs": [10, 20, 30, 40], "failures": 0}

    summary = module.summarize(payload, 4)

    assert summary == {
        "samples": 4,
        "failures": 0,
        "dnsMs": {"p50": 2.0, "p95": 4.0, "p99": 4.0},
        "connectMs": {"p50": 20.0, "p95": 40.0, "p99": 40.0},
    }
