#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PROFILE = REPO_ROOT / "docs/compliance/software-military-ready-profile-v1.yml"
CATALOG = REPO_ROOT / "docs/compliance/requirements/software-military-ready-requirements.yml"
HAZARDS = REPO_ROOT / "docs/compliance/safety/hazard-log.yml"
STIG = REPO_ROOT / "docs/compliance/security/asd-stig-v6r4-checklist.json"
POAM = REPO_ROOT / "docs/compliance/security/poam.yml"


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError(f"{path} must contain an object")
    return document


def status_counts(values: list[dict[str, Any]], field: str = "status") -> dict[str, int]:
    return dict(sorted(Counter(str(value.get(field, "MISSING")) for value in values).items()))


def build_report(source_commit: str) -> dict[str, Any]:
    profile = load_yaml(PROFILE)
    requirements = load_yaml(CATALOG)["requirements"]
    hazards = load_yaml(HAZARDS)["hazards"]
    stig = json.loads(STIG.read_text(encoding="utf-8"))
    poam = load_yaml(POAM)["items"]
    return {
        "schemaVersion": "gcs-saker.qualification-summary.v1",
        "profileId": profile["profileId"],
        "profileVersion": profile["version"],
        "profileStatus": profile["profileStatus"],
        "sourceCommit": source_commit,
        "requirements": {"total": len(requirements), "byStatus": status_counts(requirements)},
        "hazards": {"total": len(hazards), "byStatus": status_counts(hazards)},
        "stig": {"revision": stig["revision"], "total": len(stig["rules"]), "byStatus": status_counts(stig["rules"])},
        "poam": {"total": len(poam), "byStatus": status_counts(poam)},
        "claim": "assessment baseline only; not certified or conformant",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    if len(args.source_commit) != 40:
        parser.error("--source-commit must be a full 40-character revision")
    print(json.dumps(build_report(args.source_commit), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
