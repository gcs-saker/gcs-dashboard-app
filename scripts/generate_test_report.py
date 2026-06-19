#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

import architecture_intent_gate


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "output" / "reports" / "gcs-saker-test-report.html"
PRINCIPLE_MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_principle_proof_matrix.yml"
SCHEMA_VERSION = "gcs-saker-test-report-v1"


@dataclass(frozen=True)
class TestCommand:
    name: str
    description: str
    command: list[str]
    cwd: Path
    env: dict[str, str] | None = None


@dataclass(frozen=True)
class CommandResult:
    name: str
    description: str
    command: list[str]
    cwd: Path
    returncode: int
    duration_seconds: float
    stdout: str
    stderr: str

    @property
    def passed(self) -> bool:
        return self.returncode == 0


def build_commands(include_spring: bool) -> list[TestCommand]:
    commands = [
        TestCommand(
            name="Architecture Intent Gate",
            description="설계 의도 8개와 코드/compose/nginx/protocol 경계 일치 여부를 확인합니다.",
            command=["python3", "scripts/architecture_intent_gate.py", "--json"],
            cwd=REPO_ROOT,
        ),
        TestCommand(
            name="Backend Pytest",
            description="Python legacy/fallback, contract, smoke helper test를 전체 실행합니다.",
            command=["python3", "-m", "pytest", "backend/tests", "-q"],
            cwd=REPO_ROOT,
            env={"PYTHONPATH": "backend"},
        ),
        TestCommand(
            name="Frontend Vitest",
            description="React/TypeScript dashboard unit/component test를 실행합니다.",
            command=["npm", "test", "--", "--run"],
            cwd=REPO_ROOT / "gcs-dashboard",
        ),
        TestCommand(
            name="Frontend Build",
            description="TypeScript typecheck와 Vite production build를 실행합니다.",
            command=["npm", "run", "build"],
            cwd=REPO_ROOT / "gcs-dashboard",
        ),
        TestCommand(
            name="Go Media Control",
            description="Go media-control domain/httpapi/turn/streamcache/protocol test를 실행합니다.",
            command=["go", "test", "./..."],
            cwd=REPO_ROOT / "services" / "media-control",
            env={"GOCACHE": str(REPO_ROOT / ".go-build-cache")},
        ),
        TestCommand(
            name="M7 Regression Gate",
            description="M7 빠른 회귀 게이트와 compose config 계약을 실행합니다.",
            command=["scripts/m7_regression_gate.sh", "--check"],
            cwd=REPO_ROOT,
        ),
        TestCommand(
            name="Docker Compose Default",
            description="기본 active runtime compose model이 유효한지 확인합니다.",
            command=[
                "docker",
                "compose",
                "--env-file",
                "deploy/compose/.env.single-node.example",
                "-f",
                "deploy/compose/compose.single-node.poc.yml",
                "config",
                "--quiet",
            ],
            cwd=REPO_ROOT,
        ),
        TestCommand(
            name="Docker Compose Geo Profile",
            description="PostGIS geo profile이 compose model로 유효한지 확인합니다.",
            command=[
                "docker",
                "compose",
                "--env-file",
                "deploy/compose/.env.single-node.example",
                "-f",
                "deploy/compose/compose.single-node.poc.yml",
                "--profile",
                "geo",
                "config",
                "--quiet",
            ],
            cwd=REPO_ROOT,
        ),
        TestCommand(
            name="DragonFly Profile Smoke",
            description="DragonFly override profile의 compose 계약을 확인합니다.",
            command=["python3", "scripts/dragonfly_profile_smoke.py", "--run"],
            cwd=REPO_ROOT,
        ),
        TestCommand(
            name="gRPC Descriptor Smoke",
            description="gRPC gateway proto descriptor compile 계약을 확인합니다.",
            command=["python3", "scripts/grpc_runtime_smoke.py", "--run"],
            cwd=REPO_ROOT,
        ),
    ]
    if include_spring:
        commands.insert(
            5,
            TestCommand(
                name="Spring Auth Policy",
                description="Spring/Kotlin auth-policy JUnit/Jacoco test를 실행합니다.",
                command=["./gradlew", "test"],
                cwd=REPO_ROOT / "services" / "auth-policy",
                env={"GRADLE_USER_HOME": str(REPO_ROOT / ".gradle-user-home")},
            ),
        )
    return commands


def run_command(test_command: TestCommand, timeout_seconds: int) -> CommandResult:
    env = os.environ.copy()
    env.update(test_command.env or {})
    started = time.perf_counter()
    process = subprocess.run(
        test_command.command,
        cwd=test_command.cwd,
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    duration = time.perf_counter() - started
    return CommandResult(
        name=test_command.name,
        description=test_command.description,
        command=test_command.command,
        cwd=test_command.cwd,
        returncode=process.returncode,
        duration_seconds=duration,
        stdout=process.stdout,
        stderr=process.stderr,
    )


def detail_row(
    kind: str,
    subject: str,
    expected: str,
    observed: str,
    evidence: str,
    passed: bool,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "subject": subject,
        "expected": expected,
        "observed": observed,
        "evidence": evidence,
        "passed": passed,
    }


def evaluate_evidence_paths(evidence_paths: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for evidence in evidence_paths:
        path = REPO_ROOT / evidence
        rows.append(
            detail_row(
                kind="Evidence",
                subject=evidence,
                expected="근거 파일 또는 디렉터리가 존재해야 함",
                observed="존재함" if path.exists() else "없음",
                evidence=evidence,
                passed=path.exists(),
            )
        )
    return rows


def evaluate_required_texts(required_texts: list[dict[str, str]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in required_texts:
        path = REPO_ROOT / item["path"]
        text = item["text"]
        try:
            haystack = architecture_intent_gate.read_path_text(path)
            found = text in haystack
        except architecture_intent_gate.ArchitectureIntentError:
            found = False
        rows.append(
            detail_row(
                kind="Required Text",
                subject=item["path"],
                expected=f"'{text}' 포함",
                observed="포함됨" if found else "찾지 못함",
                evidence=item["path"],
                passed=found,
            )
        )
    return rows


def evaluate_forbidden_texts(forbidden_texts: list[dict[str, str]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in forbidden_texts:
        path = REPO_ROOT / item["path"]
        text = item["text"]
        try:
            haystack = architecture_intent_gate.read_path_text(path)
            found = text.lower() in haystack.lower()
        except architecture_intent_gate.ArchitectureIntentError:
            found = False
        rows.append(
            detail_row(
                kind="Forbidden Text",
                subject=item["path"],
                expected=f"'{text}' 없어야 함",
                observed="발견됨" if found else "없음",
                evidence=item["path"],
                passed=not found,
            )
        )
    return rows


def evaluate_runtime_statuses(
    expected_statuses: dict[str, str],
    runtime_status: dict[str, Any],
) -> list[dict[str, Any]]:
    stacks = runtime_status.get("stacks", {})
    rows: list[dict[str, Any]] = []
    for stack_name, expected_status in expected_statuses.items():
        entry = stacks.get(stack_name, {}) if isinstance(stacks, dict) else {}
        actual_status = entry.get("status") if isinstance(entry, dict) else None
        next_gate = entry.get("nextGate", "") if isinstance(entry, dict) else ""
        rows.append(
            detail_row(
                kind="Runtime Status",
                subject=stack_name,
                expected=expected_status,
                observed=str(actual_status or "missing"),
                evidence=next_gate or "docs/architecture/GCS-Saker_runtime_stack_status.yml",
                passed=actual_status == expected_status,
            )
        )
    return rows


def evaluate_compose_active_services(
    service_names: list[str],
    compose: dict[str, Any],
) -> list[dict[str, Any]]:
    services = compose.get("services", {})
    rows: list[dict[str, Any]] = []
    for service_name in service_names:
        service = services.get(service_name, {}) if isinstance(services, dict) else {}
        exists = isinstance(service, dict) and bool(service)
        profiles = service.get("profiles") if isinstance(service, dict) else None
        rows.append(
            detail_row(
                kind="Compose Active Service",
                subject=service_name,
                expected="기본 compose에 존재하고 profiles가 없어야 함",
                observed=f"exists={exists}, profiles={profiles}",
                evidence="deploy/compose/compose.single-node.poc.yml",
                passed=exists and profiles is None,
            )
        )
    return rows


def evaluate_compose_profile_services(
    expected_profiles: dict[str, str],
    compose: dict[str, Any],
) -> list[dict[str, Any]]:
    services = compose.get("services", {})
    rows: list[dict[str, Any]] = []
    for service_name, expected_profile in expected_profiles.items():
        service = services.get(service_name, {}) if isinstance(services, dict) else {}
        profiles = service.get("profiles") if isinstance(service, dict) else None
        rows.append(
            detail_row(
                kind="Compose Profile Service",
                subject=service_name,
                expected=f"profile '{expected_profile}'에 묶여야 함",
                observed=f"profiles={profiles}",
                evidence="deploy/compose/compose.single-node.poc.yml",
                passed=isinstance(profiles, list) and expected_profile in profiles,
            )
        )
    return rows


def evaluate_nginx_routes(routes: list[dict[str, str]], nginx: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for route in routes:
        route_path = route["route"]
        route_without_trailing_slash = route_path.rstrip("/")
        route_markers = [
            f"location = {route_without_trailing_slash}",
            f"location {route_path}",
            f"location ^~ {route_path}",
        ]
        route_found = any(marker in nginx for marker in route_markers)
        proxy_pass = route["proxyPass"]
        proxy_found = f"proxy_pass {proxy_pass}" in nginx
        rows.append(
            detail_row(
                kind="Nginx Route",
                subject=route_path,
                expected=f"{route_path} -> {proxy_pass}",
                observed=f"route_found={route_found}, proxy_found={proxy_found}",
                evidence="deploy/nginx/single-node.poc.conf",
                passed=route_found and proxy_found,
            )
        )
    return rows


def evaluate_assertions(
    assertions: dict[str, Any],
    runtime_status: dict[str, Any],
    compose: dict[str, Any],
    nginx: str,
) -> list[dict[str, Any]]:
    return [
        *evaluate_evidence_paths(assertions.get("evidencePaths", [])),
        *evaluate_required_texts(assertions.get("requiredTexts", [])),
        *evaluate_forbidden_texts(assertions.get("forbiddenTexts", [])),
        *evaluate_runtime_statuses(assertions.get("runtimeStackStatuses", {}), runtime_status),
        *evaluate_compose_active_services(assertions.get("composeActiveServices", []), compose),
        *evaluate_compose_profile_services(assertions.get("composeProfileServices", {}), compose),
        *evaluate_nginx_routes(assertions.get("nginxRoutes", []), nginx),
    ]


def evaluate_intents() -> list[dict[str, Any]]:
    matrix = architecture_intent_gate.load_yaml(architecture_intent_gate.INTENT_MATRIX)
    runtime_status = architecture_intent_gate.load_yaml(architecture_intent_gate.RUNTIME_STATUS)
    compose = architecture_intent_gate.load_yaml(architecture_intent_gate.COMPOSE_FILE)
    nginx = architecture_intent_gate.NGINX_CONFIG.read_text(encoding="utf-8")

    rows: list[dict[str, Any]] = []
    for intent in matrix["intents"]:
        intent_id = str(intent["id"])
        assertions = intent["assertions"]
        details = evaluate_assertions(assertions, runtime_status, compose, nginx)
        failed_details = [detail for detail in details if not detail["passed"]]
        rows.append(
            {
                "id": intent_id,
                "title": intent["title"],
                "category": intent["category"],
                "severity": intent["severity"],
                "cadence": intent["cadence"],
                "issue": intent["issue"],
                "rationale": intent["rationale"],
                "linkedStacks": intent["linkedStacks"],
                "assertions": len(details),
                "passed": not failed_details,
                "errors": [detail["observed"] for detail in failed_details],
                "details": details,
            }
        )
    return rows


def evaluate_principles() -> list[dict[str, Any]]:
    matrix = architecture_intent_gate.load_yaml(PRINCIPLE_MATRIX)
    runtime_status = architecture_intent_gate.load_yaml(architecture_intent_gate.RUNTIME_STATUS)
    compose = architecture_intent_gate.load_yaml(architecture_intent_gate.COMPOSE_FILE)
    nginx = architecture_intent_gate.NGINX_CONFIG.read_text(encoding="utf-8")

    rows: list[dict[str, Any]] = []
    for principle in matrix["principles"]:
        assertions = principle.get("assertions", {})
        details = evaluate_assertions(assertions, runtime_status, compose, nginx)
        failed_details = [detail for detail in details if not detail["passed"]]
        rows.append(
            {
                "id": principle["id"],
                "group": principle["group"],
                "principle": principle["principle"],
                "expectedProof": principle["expectedProof"],
                "proofState": principle["proofState"],
                "severity": principle["severity"],
                "issue": principle["issue"],
                "assertions": len(details),
                "passed": not failed_details,
                "errors": [detail["observed"] for detail in failed_details],
                "details": details,
            }
        )
    return rows


def check_contract() -> dict[str, Any]:
    commands = build_commands(include_spring=True)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "output": str(DEFAULT_OUTPUT),
        "commands": [command.name for command in commands],
        "intentReport": "per-intent expected-vs-observed evidence tables",
        "principleReport": "project principles expected-vs-observed proof tables",
    }


def render_html(
    results: list[CommandResult],
    intent_rows: list[dict[str, Any]],
    principle_rows: list[dict[str, Any]] | None = None,
) -> str:
    principle_rows = principle_rows or []
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    passed_commands = sum(1 for result in results if result.passed)
    passed_intents = sum(1 for row in intent_rows if row["passed"])
    passed_principles = sum(1 for row in principle_rows if row["passed"])
    total_duration = sum(result.duration_seconds for result in results)
    overall_passed = (
        passed_commands == len(results)
        and passed_intents == len(intent_rows)
        and passed_principles == len(principle_rows)
    )

    command_cards = "\n".join(render_command_card(result) for result in results)
    intent_cards = "\n".join(render_intent_card(row) for row in intent_rows)
    principle_cards = "\n".join(render_principle_card(row) for row in principle_rows)
    manual_principles = sum(1 for row in principle_rows if row["proofState"] == "manual")
    gap_principles = sum(1 for row in principle_rows if row["proofState"] == "gap")

    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GCS-Saker Test Report</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #071015;
      --panel: #0d1b24;
      --panel-2: #102532;
      --line: #23485d;
      --text: #e6f4ff;
      --muted: #8fb0c3;
      --ok: #45d483;
      --bad: #ff5c78;
      --warn: #f4c95d;
      --info: #62b6ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at 20% 0%, #113447 0, transparent 36rem), var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }}
    main {{ max-width: 1440px; margin: 0 auto; padding: 32px; }}
    header {{
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 20px;
      align-items: end;
      border-bottom: 1px solid var(--line);
      padding-bottom: 24px;
      margin-bottom: 24px;
    }}
    h1, h2, h3, p {{ margin: 0; }}
    h1 {{ font-size: 32px; letter-spacing: 0; }}
    h2 {{ font-size: 20px; margin: 32px 0 14px; }}
    .muted {{ color: var(--muted); }}
    .section-lead {{
      color: var(--muted);
      max-width: 960px;
      margin: -6px 0 14px;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--muted);
      background: rgba(13, 27, 36, 0.82);
      font-weight: 700;
      white-space: nowrap;
    }}
    .badge.ok {{ color: var(--ok); border-color: rgba(69, 212, 131, 0.42); }}
    .badge.bad {{ color: var(--bad); border-color: rgba(255, 92, 120, 0.5); }}
    .summary {{
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 22px;
    }}
    .metric {{
      background: linear-gradient(180deg, rgba(16, 37, 50, 0.94), rgba(9, 22, 30, 0.94));
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-height: 96px;
    }}
    .metric strong {{ display: block; font-size: 28px; margin-top: 6px; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }}
    .card {{
      background: rgba(13, 27, 36, 0.9);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-width: 0;
    }}
    .card.pass {{ border-color: rgba(69, 212, 131, 0.36); }}
    .card.fail {{ border-color: rgba(255, 92, 120, 0.5); }}
    .card-head {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 10px;
    }}
    .card h3 {{ font-size: 16px; }}
    .meta {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }}
    .pill {{
      border-radius: 999px;
      padding: 4px 8px;
      background: rgba(98, 182, 255, 0.12);
      color: #b9dcff;
      font-size: 12px;
      border: 1px solid rgba(98, 182, 255, 0.18);
    }}
    details {{
      margin-top: 12px;
      border-top: 1px solid rgba(143, 176, 195, 0.18);
      padding-top: 10px;
    }}
    summary {{ cursor: pointer; color: var(--info); font-weight: 700; }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      background: #061018;
      border: 1px solid rgba(143, 176, 195, 0.16);
      border-radius: 8px;
      padding: 12px;
      max-height: 420px;
      overflow: auto;
      color: #d8ecf7;
    }}
    .command {{
      color: #d6f5ff;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
    }}
    .intent-grid {{
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }}
    .intent-card {{
      display: grid;
      grid-template-columns: minmax(260px, 0.34fr) minmax(0, 0.66fr);
      gap: 16px;
    }}
    .intent-body {{
      display: grid;
      gap: 12px;
      align-content: start;
    }}
    .intent-note {{
      border-left: 3px solid rgba(98, 182, 255, 0.6);
      padding-left: 12px;
      color: #d8ecf7;
    }}
    .intent-table-wrap {{
      overflow: auto;
      border: 1px solid rgba(143, 176, 195, 0.18);
      border-radius: 8px;
      background: #061018;
    }}
    .intent-detail-table {{
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      font-size: 13px;
    }}
    .intent-detail-table th,
    .intent-detail-table td {{
      border-bottom: 1px solid rgba(143, 176, 195, 0.14);
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }}
    .intent-detail-table th {{
      color: #b9dcff;
      background: rgba(98, 182, 255, 0.08);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .intent-detail-table tr:last-child td {{ border-bottom: 0; }}
    .result-ok {{ color: var(--ok); font-weight: 800; }}
    .result-bad {{ color: var(--bad); font-weight: 800; }}
    .observed {{
      color: #f1fbff;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
    }}
    @media (max-width: 920px) {{
      main {{ padding: 20px; }}
      header {{ grid-template-columns: 1fr; }}
      .summary, .grid, .intent-card {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="muted">Generated at {html.escape(generated_at)}</p>
        <h1>GCS-Saker Test Report</h1>
        <p class="muted">설계 의도, contract, runtime gate, frontend/backend/build 결과를 한 화면에서 확인합니다.</p>
      </div>
      <span class="badge {'ok' if overall_passed else 'bad'}">{'PASS' if overall_passed else 'FAIL'}</span>
    </header>

    <section class="summary">
      <div class="metric"><span class="muted">Test Commands</span><strong>{passed_commands}/{len(results)}</strong></div>
      <div class="metric"><span class="muted">Design Intents</span><strong>{passed_intents}/{len(intent_rows)}</strong></div>
      <div class="metric"><span class="muted">Principles</span><strong>{passed_principles}/{len(principle_rows)}</strong></div>
      <div class="metric"><span class="muted">Assertions</span><strong>{sum(row['assertions'] for row in intent_rows) + sum(row['assertions'] for row in principle_rows)}</strong></div>
      <div class="metric"><span class="muted">Duration</span><strong>{total_duration:.1f}s</strong></div>
    </section>

    <section>
      <h2>Project Principles Proof</h2>
      <p class="section-lead">프로젝트 원칙과 코드 설계 원칙을 기대 증거, 실제 관측값, 근거 경로로 대조합니다. 자동 검증이 어려운 운영 항목은 수동 검증 필요로 남겨 거짓 완료를 막습니다. 수동 {manual_principles}개, gap {gap_principles}개.</p>
      <div class="intent-grid">{principle_cards}</div>
    </section>

    <section>
      <h2>Design Intent Gate</h2>
      <p class="section-lead">각 설계 의도는 단순 통과 표시가 아니라 기대값, 실제 관측값, 근거 파일 또는 명령, 결과를 행 단위로 고정합니다. 완료 보고와 코드 상태가 어긋나는 지점을 여기서 바로 확인합니다.</p>
      <div class="intent-grid">{intent_cards}</div>
    </section>

    <section>
      <h2>Test Commands</h2>
      <div class="grid">{command_cards}</div>
    </section>
  </main>
</body>
</html>
"""


def render_principle_card(row: dict[str, Any]) -> str:
    status = "pass" if row["passed"] else "fail"
    detail_rows = "\n".join(render_intent_detail(detail) for detail in row["details"])
    failed_count = sum(1 for detail in row["details"] if not detail["passed"])
    proof_state = {
        "automated": "자동 증거",
        "manual": "수동 검증 필요",
        "gap": "Gap",
    }.get(row["proofState"], row["proofState"])
    return f"""
<article class="card intent-card {status}">
  <div class="intent-body">
    <div class="card-head">
      <div>
        <h3>{html.escape(row['id'])}</h3>
        <p>{html.escape(row['principle'])}</p>
      </div>
      <span class="badge {('ok' if row['passed'] else 'bad')}">{'증거 일치' if row['passed'] else '증거 불일치'}</span>
    </div>
    <p class="intent-note">{html.escape(row['expectedProof'])}</p>
    <div class="meta">
      <span class="pill">{html.escape(row['group'])}</span>
      <span class="pill">{html.escape(row['severity'])}</span>
      <span class="pill">{html.escape(proof_state)}</span>
      <span class="pill">#{row['issue']}</span>
      <span class="pill">{row['assertions']} checks</span>
      <span class="pill">{failed_count} failed</span>
    </div>
  </div>
  <div class="intent-table-wrap">
    <table class="intent-detail-table">
      <thead>
        <tr>
          <th>검증 방식</th>
          <th>대상</th>
          <th>기대값</th>
          <th>실제 관측값</th>
          <th>근거</th>
          <th>결과</th>
        </tr>
      </thead>
      <tbody>{detail_rows}</tbody>
    </table>
  </div>
</article>
"""


def render_intent_card(row: dict[str, Any]) -> str:
    status = "pass" if row["passed"] else "fail"
    stacks = "".join(f"<span class=\"pill\">{html.escape(stack)}</span>" for stack in row["linkedStacks"])
    detail_rows = "\n".join(render_intent_detail(detail) for detail in row["details"])
    failed_count = sum(1 for detail in row["details"] if not detail["passed"])
    return f"""
<article class="card intent-card {status}">
  <div class="intent-body">
    <div class="card-head">
      <div>
        <h3>{html.escape(row['id'])}</h3>
        <p>{html.escape(row['title'])}</p>
      </div>
      <span class="badge {('ok' if row['passed'] else 'bad')}">{'증거 일치' if row['passed'] else '증거 불일치'}</span>
    </div>
    <p class="intent-note">{html.escape(row['rationale'])}</p>
    <div class="meta">
      <span class="pill">{html.escape(row['category'])}</span>
      <span class="pill">{html.escape(row['severity'])}</span>
      <span class="pill">{html.escape(row['cadence'])}</span>
      <span class="pill">#{row['issue']}</span>
      <span class="pill">{row['assertions']} checks</span>
      <span class="pill">{failed_count} failed</span>
    </div>
    <div class="meta">{stacks}</div>
  </div>
  <div class="intent-table-wrap">
    <table class="intent-detail-table">
      <thead>
        <tr>
          <th>검증 방식</th>
          <th>대상</th>
          <th>기대값</th>
          <th>실제 관측값</th>
          <th>근거</th>
          <th>결과</th>
        </tr>
      </thead>
      <tbody>{detail_rows}</tbody>
    </table>
  </div>
</article>
"""


def render_intent_detail(detail: dict[str, Any]) -> str:
    result_class = "result-ok" if detail["passed"] else "result-bad"
    result_text = "OK" if detail["passed"] else "FAIL"
    return f"""
<tr>
  <td>{html.escape(detail['kind'])}</td>
  <td>{html.escape(detail['subject'])}</td>
  <td>{html.escape(detail['expected'])}</td>
  <td class="observed">{html.escape(detail['observed'])}</td>
  <td>{html.escape(detail['evidence'])}</td>
  <td class="{result_class}">{result_text}</td>
</tr>
"""


def render_command_card(result: CommandResult) -> str:
    status = "pass" if result.passed else "fail"
    output = "\n".join(part for part in [result.stdout, result.stderr] if part)
    if not output:
        output = "No output"
    command_text = " ".join(result.command)
    cwd = result.cwd.relative_to(REPO_ROOT) if result.cwd.is_relative_to(REPO_ROOT) else result.cwd
    return f"""
<article class="card {status}">
  <div class="card-head">
    <div>
      <h3>{html.escape(result.name)}</h3>
      <p class="muted">{html.escape(result.description)}</p>
    </div>
    <span class="badge {('ok' if result.passed else 'bad')}">{'PASS' if result.passed else 'FAIL'}</span>
  </div>
  <div class="meta">
    <span class="pill">exit {result.returncode}</span>
    <span class="pill">{result.duration_seconds:.1f}s</span>
    <span class="pill">{html.escape(str(cwd))}</span>
  </div>
  <p class="command">{html.escape(command_text)}</p>
  <details>
    <summary>콘솔 출력</summary>
    <pre>{html.escape(output)}</pre>
  </details>
</article>
"""


def write_report(path: Path, html_content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html_content, encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run GCS-Saker checks and generate a browser-readable HTML report.")
    parser.add_argument("--check", action="store_true", help="Print report generator contract without running tests.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument("--skip-spring", action="store_true", help="Skip Spring/Gradle test command.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.check:
        print(json.dumps(check_contract(), ensure_ascii=False))
        return 0

    commands = build_commands(include_spring=not args.skip_spring)
    results = [run_command(command, args.timeout_seconds) for command in commands]
    intent_rows = evaluate_intents()
    principle_rows = evaluate_principles()
    html_content = render_html(results, intent_rows, principle_rows)
    write_report(args.output, html_content)

    print(str(args.output))
    return (
        0
        if all(result.passed for result in results)
        and all(row["passed"] for row in intent_rows)
        and all(row["passed"] for row in principle_rows)
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
