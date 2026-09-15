import base64
import json
import runpy
from pathlib import Path
from typing import Callable, cast

import pytest

DIGEST = "a" * 64
SCRIPT = Path(__file__).resolve().parents[2] / "scripts/ops/verify_mobile_release_evidence.py"
MODULE = runpy.run_path(str(SCRIPT))
MobileEvidenceError = cast(type[BaseException], MODULE["MobileEvidenceError"])
verify = cast(Callable[[Path, Path], None], MODULE["verify"])


def write_evidence(tmp_path: Path, subject_digest: str = DIGEST) -> tuple[Path, Path]:
    entry = {
        "service": "mobile-publisher",
        "image": f"ghcr.io/gcs-saker/gcs-mobile-publisher@sha256:{DIGEST}",
        "licenseReleaseAllowed": True,
    }
    statement = {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [{"digest": {"sha256": subject_digest}}],
        "predicateType": "https://sigstore.dev/cosign/sign/v1",
        "predicate": {},
    }
    bundle = {
        "mediaType": "application/vnd.dev.sigstore.bundle.v0.3+json",
        "verificationMaterial": {"certificate": {"rawBytes": "Y2VydA=="}},
        "dsseEnvelope": {
            "payload": base64.b64encode(json.dumps(statement).encode()).decode(),
        },
    }
    entry_path = tmp_path / "entry.json"
    bundle_path = tmp_path / "bundle.json"
    entry_path.write_text(json.dumps(entry), encoding="utf-8")
    bundle_path.write_text(json.dumps(bundle), encoding="utf-8")
    return entry_path, bundle_path


def test_accepts_digest_bound_archived_bundle(tmp_path: Path) -> None:
    entry_path, bundle_path = write_evidence(tmp_path)

    verify(entry_path, bundle_path)


def test_rejects_bundle_bound_to_another_image(tmp_path: Path) -> None:
    entry_path, bundle_path = write_evidence(tmp_path, "b" * 64)

    with pytest.raises(MobileEvidenceError, match="does not match"):
        verify(entry_path, bundle_path)
