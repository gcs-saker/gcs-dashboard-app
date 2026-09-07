import runpy
from copy import deepcopy
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/gates/supply_chain_policy_gate.py"
MODULE = runpy.run_path(str(SCRIPT))
SupplyChainPolicyError = cast(type[BaseException], MODULE["SupplyChainPolicyError"])
load_yaml = cast(Callable[[Path], dict[str, Any]], MODULE["load_yaml"])
validate_supply_chain = cast(Callable[..., int], MODULE["validate_supply_chain"])
POLICY = REPO_ROOT / "docs/compliance/supply-chain/supply-chain-policy.yml"
VEX = REPO_ROOT / "docs/compliance/supply-chain/vex-template.yml"


def test_supply_chain_policy_covers_every_release_image() -> None:
    assert validate_supply_chain(load_yaml(POLICY), load_yaml(VEX)) == 4


def test_supply_chain_policy_rejects_unsigned_requirement_relaxation() -> None:
    policy = load_yaml(POLICY)
    broken = deepcopy(policy)
    broken["requirements"]["containerBaseDigestRequired"] = False

    with pytest.raises(SupplyChainPolicyError, match="fail closed"):
        validate_supply_chain(broken, load_yaml(VEX))


def test_supply_chain_policy_rejects_unknown_license_allowance() -> None:
    policy = load_yaml(POLICY)
    broken = deepcopy(policy)
    broken["deniedLicenses"].remove("UNKNOWN")

    with pytest.raises(SupplyChainPolicyError, match="unknown licenses"):
        validate_supply_chain(broken, load_yaml(VEX))
