import json
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def test_cross_protocol_error_catalog_matches_runtime_contracts() -> None:
    catalog = json.loads((REPOSITORY_ROOT / "contracts/errors/v1/error-catalog.json").read_text(encoding="utf-8"))
    kotlin_errors = (
        REPOSITORY_ROOT
        / "services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/domain/shared/PolicyErrors.kt"
    ).read_text(encoding="utf-8")
    grpc_errors = (REPOSITORY_ROOT / "services/media-control/internal/grpcgateway/request_handler.go").read_text(
        encoding="utf-8"
    )
    grpc_server = (REPOSITORY_ROOT / "services/media-control/internal/grpcgateway/server.go").read_text(
        encoding="utf-8"
    )

    for code in catalog["rest"]:
        if code not in {
            "authentication_required",
            "permission_denied",
            "resource_not_found",
            "invalid_request",
            "state_conflict",
        }:
            assert code in kotlin_errors
    for code in catalog["grpc"]:
        assert code in grpc_errors or code in grpc_server


def test_error_catalog_uses_stable_machine_codes() -> None:
    catalog = json.loads((REPOSITORY_ROOT / "contracts/errors/v1/error-catalog.json").read_text(encoding="utf-8"))
    for protocol in ("rest", "grpc"):
        assert all(code == code.lower() and " " not in code for code in catalog[protocol])
