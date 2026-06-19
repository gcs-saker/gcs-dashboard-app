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


def evaluate_intents() -> list[dict[str, Any]]:
    matrix = architecture_intent_gate.load_yaml(architecture_intent_gate.INTENT_MATRIX)
    runtime_status = architecture_intent_gate.load_yaml(architecture_intent_gate.RUNTIME_STATUS)
    compose = architecture_intent_gate.load_yaml(architecture_intent_gate.COMPOSE_FILE)
    nginx = architecture_intent_gate.NGINX_CONFIG.read_text(encoding="utf-8")

    rows: list[dict[str, Any]] = []
    for intent in matrix["intents"]:
        intent_id = str(intent["id"])
        assertions = intent["assertions"]
        errors: list[str] = []
        assertion_count = 0
        checks = [
            lambda: architecture_intent_gate.assert_evidence_paths(intent_id, assertions.get("evidencePaths", [])),
            lambda: architecture_intent_gate.assert_required_texts(intent_id, assertions.get("requiredTexts", [])),
            lambda: architecture_intent_gate.assert_forbidden_texts(intent_id, assertions.get("forbiddenTexts", [])),
            lambda: architecture_intent_gate.assert_runtime_statuses(
                intent_id,
                assertions.get("runtimeStackStatuses", {}),
                runtime_status,
            ),
            lambda: architecture_intent_gate.assert_compose_active_services(
                intent_id,
                assertions.get("composeActiveServices", []),
                compose,
            ),
            lambda: architecture_intent_gate.assert_compose_profile_services(
                intent_id,
                assertions.get("composeProfileServices", {}),
                compose,
            ),
            lambda: architecture_intent_gate.assert_nginx_routes(intent_id, assertions.get("nginxRoutes", []), nginx),
        ]
        for check in checks:
            try:
                assertion_count += check()
            except architecture_intent_gate.ArchitectureIntentError as error:
                errors.append(str(error))
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
                "assertions": assertion_count,
                "passed": not errors,
                "errors": errors,
            }
        )
    return rows


def check_contract() -> dict[str, Any]:
    commands = build_commands(include_spring=True)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "output": str(DEFAULT_OUTPUT),
        "commands": [command.name for command in commands],
        "intentReport": "per-intent pass/fail cards",
    }


def render_html(results: list[CommandResult], intent_rows: list[dict[str, Any]]) -> str:
    generated_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")
    passed_commands = sum(1 for result in results if result.passed)
    passed_intents = sum(1 for row in intent_rows if row["passed"])
    total_duration = sum(result.duration_seconds for result in results)
    overall_passed = passed_commands == len(results) and passed_intents == len(intent_rows)

    command_cards = "\n".join(render_command_card(result) for result in results)
    intent_cards = "\n".join(render_intent_card(row) for row in intent_rows)

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
      grid-template-columns: repeat(4, minmax(0, 1fr));
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
    @media (max-width: 920px) {{
      main {{ padding: 20px; }}
      header {{ grid-template-columns: 1fr; }}
      .summary, .grid {{ grid-template-columns: 1fr; }}
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
      <div class="metric"><span class="muted">Assertions</span><strong>{sum(row['assertions'] for row in intent_rows)}</strong></div>
      <div class="metric"><span class="muted">Duration</span><strong>{total_duration:.1f}s</strong></div>
    </section>

    <section>
      <h2>Design Intent Gate</h2>
      <div class="grid">{intent_cards}</div>
    </section>

    <section>
      <h2>Test Commands</h2>
      <div class="grid">{command_cards}</div>
    </section>
  </main>
</body>
</html>
"""


def render_intent_card(row: dict[str, Any]) -> str:
    status = "pass" if row["passed"] else "fail"
    errors = "\n".join(row["errors"]) if row["errors"] else "No errors"
    stacks = "".join(f"<span class=\"pill\">{html.escape(stack)}</span>" for stack in row["linkedStacks"])
    return f"""
<article class="card {status}">
  <div class="card-head">
    <div>
      <h3>{html.escape(row['id'])} · {html.escape(row['title'])}</h3>
      <p class="muted">{html.escape(row['rationale'])}</p>
    </div>
    <span class="badge {('ok' if row['passed'] else 'bad')}">{'PASS' if row['passed'] else 'FAIL'}</span>
  </div>
  <div class="meta">
    <span class="pill">{html.escape(row['category'])}</span>
    <span class="pill">{html.escape(row['severity'])}</span>
    <span class="pill">{html.escape(row['cadence'])}</span>
    <span class="pill">#{row['issue']}</span>
    <span class="pill">{row['assertions']} assertions</span>
  </div>
  <div class="meta">{stacks}</div>
  <details>
    <summary>검증 상세</summary>
    <pre>{html.escape(errors)}</pre>
  </details>
</article>
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
    html_content = render_html(results, intent_rows)
    write_report(args.output, html_content)

    print(str(args.output))
    return 0 if all(result.passed for result in results) and all(row["passed"] for row in intent_rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
