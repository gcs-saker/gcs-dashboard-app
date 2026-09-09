import importlib.util
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
    for service in ("backend", "auth-policy", "media-control", "dashboard"):
        images.append(
            {
                "service": service,
                "image": f"ghcr.io/gcs-saker/gcs-saker-{service}@sha256:{digest}",
                "sbomSha256": digest,
                "licenseReportSha256": digest,
                "noticesSha256": digest,
                "licenseReleaseAllowed": True,
            }
        )
    return {
        "schemaVersion": "gcs-saker.signed-release.v1",
        "sourceCommit": "a" * 40,
        "workflowRun": "https://github.com/example/actions/runs/1",
        "createdAt": "2026-09-09T00:00:00Z",
        "images": images,
        "vex": [],
    }


def test_manifest_accepts_exact_signed_digest_inventory() -> None:
    module = load_module()

    inventory = module.validate_manifest(valid_manifest(), "a" * 40)

    assert set(inventory) == {"backend", "auth-policy", "media-control", "dashboard"}


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

    assert "cosign verify-blob" in verifier
    assert "cosign verify-attestation --type slsaprovenance" in verifier
    assert "cosign verify-attestation --type spdxjson" in verifier
    assert 'release_manifest.py" verify' in verifier
    assert "55122" not in verifier
