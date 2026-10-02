#!/usr/bin/env python3
"""Validate authoritative state, TTL, invalidation, and degraded behavior ownership."""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "docs/architecture/state-authority.yml"
EXPECTED_STORES = {
    "identity-policy",
    "refresh-sessions",
    "publish-sessions",
    "live-stream-presence",
    "browser-server-state",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def validate() -> None:
    contract = yaml.safe_load(CONTRACT.read_text(encoding="utf-8"))
    require(contract.get("schemaVersion") == "gcs-saker.state-authority.v1", "unexpected state contract schema")
    stores = contract.get("stores", [])
    require({store.get("id") for store in stores} == EXPECTED_STORES, "state stores differ from the owned inventory")
    for store in stores:
        store_id = store["id"]
        for field in ("owner", "authority", "data", "invalidationEvents", "degradedBehavior"):
            require(store.get(field), f"{store_id} is missing {field}")
        if store["authority"] != "PostgreSQL":
            ttl = store.get("ttlSeconds")
            require(isinstance(ttl, int) and 0 < ttl <= 86_400, f"{store_id} requires a bounded replica TTL")
    rules = contract.get("rules", {})
    for denied_rule in ("credentialMaterialInKeys", "browserMayAuthorize", "cacheMayGrantAccess"):
        require(rules.get(denied_rule) is False, f"{denied_rule} must remain denied")
    require(rules.get("utcRequired") is True, "UTC storage must remain required")
    print(f"state authority contract passed for {len(stores)} stores")


if __name__ == "__main__":
    validate()
