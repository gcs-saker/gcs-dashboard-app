#!/usr/bin/env python3
"""Describe the isolated minimal Coturn promotion contract."""

from __future__ import annotations

import json


def main() -> int:
    evidence = {
        "schemaVersion": "gcs-saker.coturn-minimal-poc-smoke.v1",
        "status": "promotion-blocked-on-physical-talkback",
        "requiredPass": [
            "pinned source build",
            "no database or Kerberos dynamic links",
            "long-term TURN allocation and relay packet loop",
            "shared-secret temporary credential allocation",
            "relay-only WHIP publish",
            "relay-only WHEP audio and video frames",
            "fixed High and Critical vulnerability count equals zero",
        ],
        "mustRemainBlocked": ["physical mobile Talkback receive and intelligibility"],
        "forbiddenPromotionChanges": ["compose image replacement", "production deployment"],
    }
    print(json.dumps(evidence, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
