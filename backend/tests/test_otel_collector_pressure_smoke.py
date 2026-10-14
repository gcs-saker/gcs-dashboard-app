import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/smoke/otel_collector_pressure_smoke.py"


def load_smoke():
    spec = importlib.util.spec_from_file_location("otel_pressure_smoke", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("leaks", [False, True])
def test_smoke_rejects_private_export_and_always_cleans_resources(monkeypatch, leaks):
    smoke = load_smoke()
    calls = []

    def docker(*arguments):
        calls.append(arguments)
        if arguments[0] == "logs":
            return smoke.CANARY if leaks else "gcs.request gcs.event"
        if arguments[0] == "run" and "--rm" in arguments:
            return '{"result":"PASS"}'
        return ""

    monkeypatch.setattr(smoke, "docker", docker)
    if leaks:
        with pytest.raises(RuntimeError, match="privacy contract failed"):
            smoke.run_smoke()
    else:
        smoke.run_smoke()
    assert calls[-2][0:2] == ("rm", "-f")
    assert calls[-1][0:2] == ("network", "rm")


def test_pressure_evidence_cannot_count_a_different_exporter():
    smoke = load_smoke()
    metrics = "\n".join(
        [
            'otelcol_exporter_enqueue_failed_spans{exporter="debug"} 99',
            'otelcol_exporter_enqueue_failed_spans{exporter="otlp/fault"} 7',
            "# HELP otelcol_exporter_enqueue_failed_spans ignored",
        ]
    )
    assert smoke.metric_value(metrics, "otelcol_exporter_enqueue_failed_spans") == 7


def test_pressure_evidence_requires_capacity_drop_and_export_failure(monkeypatch):
    smoke = load_smoke()
    monkeypatch.setattr(smoke, "http_get", lambda _url: 'otelcol_exporter_queue_size{exporter="otlp/fault"} 0')
    monkeypatch.setattr(smoke.time, "sleep", lambda _delay: None)
    with pytest.raises(RuntimeError, match="evidence is incomplete"):
        smoke.verify_pressure_metrics()
