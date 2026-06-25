#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
DRAGONFLY_OVERRIDE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.dragonfly.override.yml"
ENV_FILE = REPO_ROOT / "deploy" / "compose" / ".env.single-node.example"
SCHEMA_VERSION = "dragonfly-profile-smoke-v1"


@dataclass(frozen=True)
class DragonflyProfileSmokeConfig:
    compose_file: Path
    override_file: Path
    env_file: Path

    def config_command(self) -> list[str]:
        return [
            "docker",
            "compose",
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
            "-f",
            str(self.override_file),
            "config",
            "--quiet",
        ]

    def readiness_command(self) -> list[str]:
        return [
            "docker",
            "compose",
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
            "-f",
            str(self.override_file),
            "up",
            "-d",
            "redis",
            "auth-policy",
            "media-control",
        ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate the DragonFly Redis-compatible cache profile.")
    parser.add_argument("--check", action="store_true", help="Print the stable smoke contract without executing docker.")
    parser.add_argument("--run", action="store_true", help="Run compose config validation for the DragonFly profile.")
    parser.add_argument("--compose-file", type=Path, default=COMPOSE_FILE)
    parser.add_argument("--override-file", type=Path, default=DRAGONFLY_OVERRIDE_FILE)
    parser.add_argument("--env-file", type=Path, default=ENV_FILE)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = DragonflyProfileSmokeConfig(
        compose_file=args.compose_file,
        override_file=args.override_file,
        env_file=args.env_file,
    )

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "status": "profile",
        "configCommand": config.config_command(),
        "readinessCommand": config.readiness_command(),
        "checks": [
            "redis service is replaced by DragonFly image",
            "auth-policy starts with DragonFly-compatible Redis protocol",
            "media-control starts with DragonFly-compatible Redis protocol",
            "session/cache/ICE/stream-cache behavior matches Redis profile",
        ],
        "promotionGate": "Promote to active only after Redis and DragonFly runtime smoke results are equivalent.",
    }

    if args.check or not args.run:
        print(json.dumps(payload, ensure_ascii=False))
        return 0

    result = subprocess.run(
        config.config_command(),
        check=False,
        text=True,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
