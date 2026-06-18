from __future__ import annotations

from pathlib import Path
import re
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[2]
PROTO_ROOT = REPO_ROOT / "contracts" / "proto"
PROTO_FILES = sorted((PROTO_ROOT / "gcs" / "saker" / "v1").glob("*.proto"))
DESCRIPTOR_SET = REPO_ROOT / "tmp" / "gcs-saker-protobuf-contract.pb"


def test_proto_files_compile_to_descriptor_set() -> None:
    DESCRIPTOR_SET.parent.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        [
            "protoc",
            f"--proto_path={PROTO_ROOT}",
            f"--descriptor_set_out={DESCRIPTOR_SET}",
            "--include_imports",
            *[str(path.relative_to(PROTO_ROOT)) for path in PROTO_FILES],
        ],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert DESCRIPTOR_SET.exists()
    assert DESCRIPTOR_SET.stat().st_size > 0


def test_proto_files_use_stable_package_and_language_options() -> None:
    for proto_file in PROTO_FILES:
        content = proto_file.read_text(encoding="utf-8")

        assert 'package gcs.saker.v1;' in content
        assert 'option go_package = "github.com/gcs-saker/gcs-dashboard-app/contracts/gen/go/gcs/saker/v1;sakerv1";' in content
        assert 'option java_multiple_files = true;' in content
        assert 'option java_package = "kr.co.a4ai.gcssaker.contracts.v1";' in content


def test_evolvable_event_messages_keep_reserved_field_ranges() -> None:
    event_proto_files = [
        "ai_overlay.proto",
        "ops_event.proto",
        "stream_control.proto",
        "telemetry.proto",
    ]

    for file_name in event_proto_files:
        content = (PROTO_ROOT / "gcs" / "saker" / "v1" / file_name).read_text(encoding="utf-8")
        message_names = re.findall(r"message\s+(\w+)\s+\{", content)
        assert message_names, f"{file_name} has no message definitions"
        assert "reserved" in content, f"{file_name} must reserve fields for compatibility"
