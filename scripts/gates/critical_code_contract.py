#!/usr/bin/env python3
"""Reject immediately dangerous error-hiding, secret logging, and resource patterns."""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOTS = (
    REPO_ROOT / "backend",
    REPO_ROOT / "gcs-dashboard" / "src",
    REPO_ROOT / "services" / "auth-policy" / "src" / "main",
    REPO_ROOT / "services" / "media-control" / "cmd",
    REPO_ROOT / "services" / "media-control" / "internal",
)
SOURCE_SUFFIXES = {".go", ".kt", ".py", ".ts", ".tsx"}
EXCLUDED_PARTS = {"__pycache__", "generated", "node_modules", "test", "tests"}
SENSITIVE_NAME = r"(?:credential|password|secret|bearer|authorization|cookie|refresh_token|access_token|publish_token|playback_token)"
LOG_CALL = r"(?:log|logger)\.(?:trace|debug|info|warn|warning|error|exception|critical)"


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    rule: str
    detail: str


def sources() -> list[Path]:
    paths: list[Path] = []
    for root in SOURCE_ROOTS:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            if (
                any(part in EXCLUDED_PARTS for part in path.parts)
                or ".test." in path.name
                or "_test." in path.name
                or path.name.endswith("Test.kt")
            ):
                continue
            paths.append(path)
    return sorted(paths)


def scan_python(path: Path, text: str) -> list[Violation]:
    violations: list[Violation] = []
    tree = ast.parse(text, filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and is_unbounded_python_http_call(node):
            violations.append(
                Violation(path, node.lineno, "PY_HTTP_NO_TIMEOUT", "package-level HTTP call has no explicit timeout")
            )
        if not isinstance(node, ast.ExceptHandler):
            continue
        if node.type is None:
            violations.append(Violation(path, node.lineno, "PY_BARE_EXCEPT", "bare except hides the failure class"))
        if len(node.body) == 1 and isinstance(node.body[0], (ast.Pass, ast.Expr)):
            expression = node.body[0]
            if isinstance(expression, ast.Pass) or (isinstance(expression, ast.Expr) and expression.value is Ellipsis):
                violations.append(
                    Violation(path, node.lineno, "PY_EMPTY_EXCEPT", "exception handler discards the failure")
                )
        if is_broad_exception(node.type) and handler_returns_plausible_default(node.body):
            violations.append(
                Violation(path, node.lineno, "PY_SWALLOWED_EXCEPTION", "broad exception becomes a success-like default")
            )
    return violations


def is_unbounded_python_http_call(node: ast.Call) -> bool:
    if not isinstance(node.func, ast.Attribute) or not isinstance(node.func.value, ast.Name):
        return False
    if node.func.value.id not in {"requests", "httpx"} or node.func.attr not in {
        "delete",
        "get",
        "head",
        "patch",
        "post",
        "put",
        "request",
    }:
        return False
    return not any(keyword.arg == "timeout" for keyword in node.keywords)


def is_broad_exception(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Name) and node.id in {"Exception", "BaseException"}


def handler_returns_plausible_default(body: list[ast.stmt]) -> bool:
    if len(body) != 1 or not isinstance(body[0], ast.Return):
        return False
    value = body[0].value
    if value is None:
        return True
    if isinstance(value, ast.Constant):
        return value.value in {None, False, ""}
    if isinstance(value, ast.Dict):
        return not value.keys
    if isinstance(value, (ast.List, ast.Set, ast.Tuple)):
        return not value.elts
    return False


def scan_text(path: Path, text: str) -> list[Violation]:
    violations: list[Violation] = []
    patterns = (
        (
            "EMPTY_CATCH",
            re.compile(r"catch\s*(?:\([^)]*\))?\s*\{\s*\}", re.MULTILINE),
            "empty catch discards the failure",
        ),
        ("GO_HTTP_NO_TIMEOUT", re.compile(r"(?:&\s*)?http\.Client\s*\{\s*\}"), "Go HTTP client has no timeout"),
        (
            "GO_PACKAGE_HTTP_CALL",
            re.compile(r"\bhttp\.(?:Get|Post|PostForm|Head)\s*\("),
            "package-level Go HTTP call has no owned timeout",
        ),
        (
            "GO_UNSTOPPABLE_TICKER",
            re.compile(r"\btime\.Tick\s*\("),
            "time.Tick cannot be stopped; own a time.NewTicker lifecycle",
        ),
        ("KOTLIN_GLOBAL_SCOPE", re.compile(r"\bGlobalScope\s*\."), "global coroutine scope has no bounded owner"),
        (
            "SENSITIVE_LOG_INTERPOLATION",
            re.compile(
                rf"{LOG_CALL}[^\n]*(?:\$\{{\s*{SENSITIVE_NAME}\b|\{{\s*{SENSITIVE_NAME}\s*\}}|,\s*{SENSITIVE_NAME}\b)",
                re.IGNORECASE,
            ),
            "credential-bearing value is interpolated into a log call",
        ),
    )
    for rule, pattern, detail in patterns:
        for match in pattern.finditer(text):
            violations.append(Violation(path, text.count("\n", 0, match.start()) + 1, rule, detail))
    return violations


def main() -> int:
    violations: list[Violation] = []
    checked = sources()
    for path in checked:
        text = path.read_text(encoding="utf-8")
        if path.suffix == ".py":
            violations.extend(scan_python(path, text))
        violations.extend(scan_text(path, text))
    if violations:
        for violation in violations:
            relative = violation.path.relative_to(REPO_ROOT)
            print(f"{relative}:{violation.line}: {violation.rule} {violation.detail}")
        return 1
    print(f"critical code contract passed for {len(checked)} production files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
