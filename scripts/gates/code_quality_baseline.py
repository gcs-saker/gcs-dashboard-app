#!/usr/bin/env python3
"""Measure function quality and prevent new or enlarged baseline violations."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BASELINE_PATH = REPO_ROOT / "scripts" / "gates" / "code_quality_baseline.json"
SOURCE_ROOTS = (
    REPO_ROOT / "backend",
    REPO_ROOT / "gcs-dashboard" / "src",
    REPO_ROOT / "services" / "auth-policy" / "src" / "main",
    REPO_ROOT / "services" / "media-control" / "cmd",
    REPO_ROOT / "services" / "media-control" / "internal",
)
SUFFIX_LANGUAGE = {".go": "go", ".kt": "kotlin", ".py": "python", ".ts": "typescript", ".tsx": "typescript"}
EXCLUDED_PARTS = {"__pycache__", "generated", "node_modules"}
MAX_FUNCTION_LINES = 60
MAX_COMPLEXITY = 10


@dataclass(frozen=True)
class FunctionMetric:
    key: str
    path: str
    language: str
    name: str
    start_line: int
    line_count: int
    complexity: int
    content_hash: str


def production_sources() -> list[Path]:
    sources: list[Path] = []
    for root in SOURCE_ROOTS:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in SUFFIX_LANGUAGE:
                continue
            if any(part in EXCLUDED_PARTS for part in path.parts) or is_test_source(path):
                continue
            sources.append(path)
    return sorted(sources)


def is_test_source(path: Path) -> bool:
    return (
        "tests" in path.parts
        or "test" in path.parts
        or ".test." in path.name
        or "_test." in path.name
        or path.name.endswith("Test.kt")
    )


def scan_functions() -> list[FunctionMetric]:
    metrics: list[FunctionMetric] = []
    for path in production_sources():
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".py":
            metrics.extend(scan_python(path, text))
        else:
            metrics.extend(scan_braced_language(path, text, SUFFIX_LANGUAGE[path.suffix]))
    return metrics


def scan_python(path: Path, text: str) -> list[FunctionMetric]:
    tree = ast.parse(text, filename=str(path))
    lines = text.splitlines()
    occurrences: Counter[str] = Counter()
    metrics: list[FunctionMetric] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or node.end_lineno is None:
            continue
        occurrences[node.name] += 1
        body = "\n".join(lines[node.lineno - 1 : node.end_lineno])
        metrics.append(
            build_metric(path, "python", node.name, occurrences[node.name], node.lineno, body, python_complexity(node))
        )
    return metrics


def python_complexity(node: ast.AST) -> int:
    complexity = 1
    for child in ast.walk(node):
        if isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.IfExp, ast.comprehension)):
            complexity += 1
        elif isinstance(child, ast.BoolOp):
            complexity += max(1, len(child.values) - 1)
        elif isinstance(child, ast.Try):
            complexity += len(child.handlers) + bool(child.orelse)
        elif isinstance(child, ast.Match):
            complexity += max(0, len(child.cases) - 1)
    return complexity


FUNCTION_PATTERNS = {
    "go": re.compile(r"^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\("),
    "kotlin": re.compile(
        r"^\s*(?:(?:public|private|protected|internal|open|override|suspend|inline|operator|tailrec)\s+)*fun\s+(?:<[^>]+>\s*)?([A-Za-z_]\w*)\s*\("
    ),
    "typescript": re.compile(
        r"^\s*(?:(?:export|default|async)\s+)*(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=.*=>)"
    ),
}


def scan_braced_language(path: Path, text: str, language: str) -> list[FunctionMetric]:
    lines = text.splitlines()
    occurrences: Counter[str] = Counter()
    metrics: list[FunctionMetric] = []
    index = 0
    while index < len(lines):
        match = FUNCTION_PATTERNS[language].search(lines[index])
        if not match:
            index += 1
            continue
        name = next(group for group in match.groups() if group)
        end = find_braced_end(lines, index)
        if end is None:
            index += 1
            continue
        occurrences[name] += 1
        body = "\n".join(lines[index : end + 1])
        metrics.append(build_metric(path, language, name, occurrences[name], index + 1, body, lexical_complexity(body)))
        index = end + 1
    return metrics


def find_braced_end(lines: list[str], start: int) -> int | None:
    depth = 0
    opened = False
    for index in range(start, len(lines)):
        line = strip_strings_and_comments(lines[index])
        depth += line.count("{")
        if line.count("{"):
            opened = True
        depth -= line.count("}")
        if opened and depth <= 0:
            return index
    return None


def strip_strings_and_comments(line: str) -> str:
    without_comment = re.sub(r"//.*$", "", line)
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`', "", without_comment)


def lexical_complexity(body: str) -> int:
    cleaned = "\n".join(strip_strings_and_comments(line) for line in body.splitlines())
    decisions = len(re.findall(r"\b(if|for|while|case|catch|when)\b|&&|\|\||\?\?", cleaned))
    return 1 + decisions


def build_metric(
    path: Path,
    language: str,
    name: str,
    occurrence: int,
    start_line: int,
    body: str,
    complexity: int,
) -> FunctionMetric:
    relative_path = path.relative_to(REPO_ROOT).as_posix()
    normalized = "\n".join(line.rstrip() for line in body.splitlines()).strip()
    return FunctionMetric(
        key=f"{relative_path}::{name}::{occurrence}",
        path=relative_path,
        language=language,
        name=name,
        start_line=start_line,
        line_count=len(body.splitlines()),
        complexity=complexity,
        content_hash=hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16],
    )


def baseline_payload(metrics: list[FunctionMetric]) -> dict[str, object]:
    offenders = [metric for metric in metrics if is_offender(metric)]
    return {
        "schemaVersion": 1,
        "limits": {"maxFunctionLines": MAX_FUNCTION_LINES, "maxComplexity": MAX_COMPLEXITY},
        "summary": summarize(metrics),
        "functions": {
            metric.key: [metric.content_hash, metric.line_count, metric.complexity]
            for metric in sorted(offenders, key=lambda item: item.key)
        },
    }


def is_offender(metric: FunctionMetric) -> bool:
    return metric.line_count > MAX_FUNCTION_LINES or metric.complexity > MAX_COMPLEXITY


def summarize(metrics: list[FunctionMetric]) -> dict[str, object]:
    languages = Counter(metric.language for metric in metrics)
    long_functions = [metric for metric in metrics if metric.line_count > MAX_FUNCTION_LINES]
    complex_functions = [metric for metric in metrics if metric.complexity > MAX_COMPLEXITY]
    return {
        "functionCount": len(metrics),
        "functionCountByLanguage": dict(sorted(languages.items())),
        "longFunctionCount": len(long_functions),
        "complexFunctionCount": len(complex_functions),
        "maxFunctionLines": max((metric.line_count for metric in metrics), default=0),
        "maxComplexity": max((metric.complexity for metric in metrics), default=0),
    }


def check_baseline(metrics: list[FunctionMetric], reference_ref: str | None = None) -> list[str]:
    payload = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    previous = payload["functions"]
    current_offenders = {metric.key: metric for metric in metrics if is_offender(metric)}
    violations: list[str] = []
    for key, metric in current_offenders.items():
        old = previous.get(key)
        if old is None:
            violations.append(
                f"{metric.path}:{metric.start_line} new or changed function {metric.name} exceeds the strict quality limits"
            )
        elif old != [metric.content_hash, metric.line_count, metric.complexity]:
            violations.append(
                f"{metric.path}:{metric.start_line} offender baseline is stale for {metric.name}; refactor it before updating the baseline"
            )
    stale_keys = sorted(set(previous) - set(current_offenders))
    if stale_keys:
        violations.append(
            f"quality baseline contains {len(stale_keys)} resolved functions; regenerate it to lock in the reduction"
        )
    current_summary = summarize(metrics)
    if current_summary != payload["summary"]:
        violations.append("quality baseline summary does not match the current source inventory")
    if reference_ref:
        reference = load_reference_baseline(reference_ref)
        if reference is not None:
            violations.extend(compare_reference_baseline(payload, reference, reference_ref))
    return violations


def load_reference_baseline(reference_ref: str) -> dict[str, object] | None:
    result = subprocess.run(
        ["git", "show", f"{reference_ref}:scripts/gates/code_quality_baseline.json"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)


def compare_reference_baseline(
    current: dict[str, object],
    reference: dict[str, object],
    reference_ref: str,
) -> list[str]:
    violations: list[str] = []
    current_summary = current["summary"]
    reference_summary = reference["summary"]
    for field in ("longFunctionCount", "complexFunctionCount", "maxFunctionLines", "maxComplexity"):
        if current_summary[field] > reference_summary[field]:
            violations.append(
                f"quality baseline increased from {reference_ref}: {field} {reference_summary[field]} -> {current_summary[field]}"
            )
    reference_functions = reference["functions"]
    for key, metric in current["functions"].items():
        old = reference_functions.get(key)
        if old is None:
            violations.append(f"new baseline offender is prohibited: {key}")
        elif metric[1] > old[1] or metric[2] > old[2]:
            violations.append(f"baseline offender grew from {reference_ref}: {key}")
    return violations


def print_report(metrics: list[FunctionMetric]) -> None:
    print(json.dumps(summarize(metrics), ensure_ascii=False, indent=2))
    offenders = sorted(
        (metric for metric in metrics if metric.line_count > MAX_FUNCTION_LINES or metric.complexity > MAX_COMPLEXITY),
        key=lambda item: (item.complexity, item.line_count),
        reverse=True,
    )
    for metric in offenders:
        print(
            f"{metric.path}:{metric.start_line} {metric.name} lines={metric.line_count} complexity={metric.complexity}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-baseline", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--reference-ref")
    args = parser.parse_args()
    metrics = scan_functions()
    if args.write_baseline:
        BASELINE_PATH.write_text(
            json.dumps(baseline_payload(metrics), ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        print(f"wrote code quality baseline for {len(metrics)} functions")
        return 0
    if args.check:
        if not BASELINE_PATH.exists():
            print("code quality baseline is missing")
            return 1
        violations = check_baseline(metrics, args.reference_ref)
        if violations:
            print("\n".join(violations))
            return 1
        print(f"code quality baseline contract passed for {len(metrics)} functions")
        return 0
    print_report(metrics)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
