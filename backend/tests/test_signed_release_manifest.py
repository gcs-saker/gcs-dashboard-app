import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts/ops/release_manifest.py"


def load_module():
    spec = importlib.util.spec_from_file_location("release_manifest", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_manifest() -> dict:
    digest = "1" * 64
    images = []
    for service in (
        "backend",
        "auth-policy",
        "media-control",
        "dashboard",
        "mqtt",
        "mediamtx",
        "turn",
        "mobile-publisher",
    ):
        image_name = "gcs-mobile-publisher" if service == "mobile-publisher" else f"gcs-saker-{service}"
        images.append(
            {
                "service": service,
                "image": f"ghcr.io/gcs-saker/{image_name}@sha256:{digest}",
                "sbomSha256": digest,
                "licenseReportSha256": digest,
                "noticesSha256": digest,
                "licenseScope": "distribution",
                "licenseDeploymentAllowed": True,
                "licenseReleaseAllowed": True,
            }
        )
    runtime_path = REPO_ROOT / "docs/compliance/supply-chain/runtime-delivery-inventory.json"
    return {
        "schemaVersion": "gcs-saker.signed-release.v3",
        "sourceCommit": "a" * 40,
        "workflowRun": "https://github.com/example/actions/runs/1",
        "createdAt": "2026-09-09T00:00:00Z",
        "images": images,
        "runtimeInventory": json.loads(runtime_path.read_text(encoding="utf-8")),
        "runtimeInventorySha256": hashlib.sha256(runtime_path.read_bytes()).hexdigest(),
        "vex": [],
    }


def test_manifest_accepts_exact_signed_digest_inventory() -> None:
    module = load_module()

    inventory = module.validate_manifest(valid_manifest(), "a" * 40)

    assert set(inventory) == {
        "backend",
        "auth-policy",
        "media-control",
        "dashboard",
        "mqtt",
        "mediamtx",
        "turn",
        "mobile-publisher",
    }


def test_manifest_rejects_mutable_image_reference() -> None:
    module = load_module()
    manifest = valid_manifest()
    manifest["images"][0]["image"] = "ghcr.io/gcs-saker/gcs-saker-backend:latest"

    with pytest.raises(module.ReleaseManifestError, match="invalid image entry"):
        module.validate_manifest(manifest, "a" * 40)


def test_manifest_rejects_source_commit_mismatch() -> None:
    module = load_module()

    with pytest.raises(module.ReleaseManifestError, match="source commit mismatch"):
        module.validate_manifest(valid_manifest(), "b" * 40)


def test_manifest_rejects_unapproved_vex() -> None:
    module = load_module()
    manifest = valid_manifest()
    manifest["vex"] = [{"vulnerability": "CVE-example"}]

    with pytest.raises(module.ReleaseManifestError, match="approved VEX fields"):
        module.validate_manifest(manifest, "a" * 40)


def test_manifest_accepts_internal_scope_only_for_server_services() -> None:
    module = load_module()
    manifest = valid_manifest()
    backend = next(entry for entry in manifest["images"] if entry["service"] == "backend")
    backend.update({"licenseScope": "internal-service", "licenseReleaseAllowed": False})

    module.validate_manifest(manifest, "a" * 40)

    mobile = next(entry for entry in manifest["images"] if entry["service"] == "mobile-publisher")
    mobile.update({"licenseScope": "internal-service", "licenseReleaseAllowed": False})
    with pytest.raises(module.ReleaseManifestError, match="invalid internal-service"):
        module.validate_manifest(manifest, "a" * 40)


def test_manifest_accepts_complete_unexpired_vex() -> None:
    module = load_module()
    manifest = valid_manifest()
    manifest["vex"] = [
        {
            "vulnerability": "CVE-2099-0001",
            "component": "pkg:generic/example@1",
            "status": "not_affected",
            "justification": "vulnerable code is not present",
            "impactStatement": "no reachable impact",
            "mitigation": "runtime boundary blocks the affected path",
            "owner": "security-owner",
            "approvedBy": "release-approver",
            "expiresAt": "2099-12-31",
            "removalCondition": "remove when upstream metadata is corrected",
        }
    ]

    module.validate_manifest(manifest, "a" * 40)


def test_deploy_verifies_manifest_and_all_attestations() -> None:
    verifier = (REPO_ROOT / "scripts/ops/verify_signed_release.sh").read_text(encoding="utf-8")
    assert 'cosign_bin="${COSIGN_BIN:-}"' in verifier
    assert '"${HOME}/.local/bin/cosign"' in verifier
    assert '"${cosign_bin}" verify-blob' in verifier
    assert '"${cosign_bin}" verify-attestation' in verifier

    assert "slsa_predicate='https://slsa.dev/provenance/v1'" in verifier
    assert "spdx_predicate='https://spdx.dev/Document/v2.3'" in verifier
    assert '"${cosign_bin}" verify-attestation --type "${slsa_predicate}"' in verifier
    assert '"${cosign_bin}" verify-attestation --type "${spdx_predicate}"' in verifier
    assert 'release_manifest.py" verify' in verifier
    assert "export MQTT_IMAGE=" in verifier
    assert "export MEDIAMTX_IMAGE=" in verifier
    assert "export COTURN_IMAGE=" in verifier
    assert "export MOBILE_PUBLISHER_IMAGE=" in verifier
    assert "gcs-mobile-publisher/.github/workflows/signed-release.yml" in verifier
    assert "55122" not in verifier


def test_release_workflow_builds_hardened_infrastructure_images() -> None:
    workflow = (REPO_ROOT / ".github/workflows/release-supply-chain.yml").read_text(encoding="utf-8")

    assert "image: mqtt" in workflow
    assert "file: deploy/mosquitto/Dockerfile.hardened" in workflow
    assert "image: mediamtx" in workflow
    assert "file: deploy/mediamtx/Dockerfile.hardened" in workflow
    assert "image: turn" in workflow
    assert "file: deploy/coturn/Dockerfile.hardened" in workflow
