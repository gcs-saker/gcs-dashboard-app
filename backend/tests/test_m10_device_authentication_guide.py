from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEVICE_AUTH_GUIDE = REPO_ROOT / "docs/api/GCS-Saker_Device_Authentication_Guide.md"
SWAGGER_STYLE_TABLE = REPO_ROOT / "docs/api/GCS-Saker_API_Swagger_Style_Table.md"
ENDPOINT_CATALOGUE = REPO_ROOT / "docs/architecture/GCS-Saker_M10_endpoint_catalogue.md"
DEVICE_STREAMING_CONTRACT = REPO_ROOT / "docs/api/GCS-Saker_API_Device_Streaming_Contract_v0.1.md"


def test_device_authentication_guide_explains_publisher_flow_and_claims() -> None:
    guide = DEVICE_AUTH_GUIDE.read_text(encoding="utf-8")

    required_fragments = [
        "POST /auth-policy/auth/login",
        "GET /media-control/api/v1/streams/{streamId}/publish",
        "POST /webrtc/{streamPath}/whip?publisherToken=...",
        "POST /auth-policy/policy/devices/publish",
        "`deviceUuid`",
        "`streamId`",
        "`path`",
        "`groupId`",
        "`action`",
        "`exp`",
        "HMAC-SHA256",
        "MediaMTX auth hook",
    ]

    for fragment in required_fragments:
        assert fragment in guide


def test_device_authentication_guide_documents_group_mapping_and_rejection() -> None:
    guide = DEVICE_AUTH_GUIDE.read_text(encoding="utf-8")

    assert "MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID" in guide
    assert "MEDIA_CONTROL_STREAM_GROUP_MAP" in guide
    assert "raw/company-b/front=co-b" in guide
    assert "signed `publisherToken`" in guide
    assert "group claim 존재" in guide
    assert "`groupId`를 넣지 않는다" in guide
    assert "registered_devices.group_id" in guide


def test_endpoint_tables_reference_stream_scoped_publish_token() -> None:
    swagger_table = SWAGGER_STYLE_TABLE.read_text(encoding="utf-8")
    endpoint_catalogue = ENDPOINT_CATALOGUE.read_text(encoding="utf-8")
    device_streaming_contract = DEVICE_STREAMING_CONTRACT.read_text(encoding="utf-8")

    for document in [swagger_table, endpoint_catalogue, device_streaming_contract]:
        assert "publisherToken" in document
        assert "streamId" in document
        assert "path" in document
        assert "groupId" in document
        assert "action" in document
        assert "exp" in document
