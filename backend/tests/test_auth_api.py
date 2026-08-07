from collections.abc import Callable, Generator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from api.auth import get_password_hash
from api.contracts import AuthProtocol
from core.db import Base, get_db
from core.security import AuthSettings, create_access_token, create_refresh_token
from main import app
from modules.messaging.control_publisher import ControlMessagePublisher, get_control_message_publisher
from modules.messaging.sender import MessageEnvelope, MessageSenderUnavailableError
from sql.company_sql import Company
from sql.user_sql import User

TEST_AUTH_SECRET = "test-auth-secret-for-gcs-saker-at-least-32-characters"
TEST_CSRF_HEADERS = {AuthProtocol.CSRF_HEADER_NAME: AuthProtocol.CSRF_HEADER_VALUE}


class RecordingMessageSender:
    def __init__(self, published: list[tuple[str, str | bytes]]) -> None:
        self._published = published

    def send(self, envelope: MessageEnvelope) -> None:
        self._published.append((envelope.destination, envelope.payload))


class FailingMessageSender:
    def send(self, envelope: MessageEnvelope) -> None:
        raise MessageSenderUnavailableError("gRPC gateway target is not configured")


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = testing_session_local()
    db.add(Company(id=1, companyname="A4AI", invite_code="A4AI01"))
    db.add(
        User(
            username="operator01",
            email="operator01@example.com",
            password_hash=get_password_hash("correct-password"),
            company_id=1,
            role="operator",
        )
    )
    db.commit()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def auth_client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_login_issues_access_token_and_me_returns_claims(auth_client: TestClient) -> None:
    login_response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
    )
    assert login_response.status_code == 200
    token_payload = login_response.json()
    assert token_payload["token_type"] == "bearer"
    assert token_payload["role"] == "operator"
    assert token_payload["username"] == "operator01"
    set_cookie = login_response.headers["set-cookie"]
    assert "gcs_saker_refresh=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "SameSite=lax" in set_cookie

    me_response = auth_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token_payload['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json() == {"username": "operator01", "role": "operator"}


def test_refresh_uses_httponly_cookie_and_rotates_access_token(auth_client: TestClient) -> None:
    login_response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["access_token"]

    refresh_response = auth_client.post("/auth/refresh")

    assert refresh_response.status_code == 200
    token_payload = refresh_response.json()
    assert token_payload["access_token"]
    assert token_payload["token_type"] == "bearer"
    assert token_payload["username"] == "operator01"
    assert token_payload["role"] == "operator"
    assert "gcs_saker_refresh=" in refresh_response.headers["set-cookie"]


def test_cookie_auth_posts_reject_untrusted_origin(auth_client: TestClient) -> None:
    login_response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    refresh_response = auth_client.post("/auth/refresh", headers={"Origin": "https://evil.example"})
    logout_response = auth_client.post(
        "/auth/logout",
        headers={"Referer": "https://evil.example/session"},
    )

    assert refresh_response.status_code == 403
    assert refresh_response.json() == {"detail": "untrusted request origin"}
    assert logout_response.status_code == 403
    assert logout_response.json() == {"detail": "untrusted request origin"}


def test_cookie_auth_posts_accept_configured_origin(auth_client: TestClient) -> None:
    login_response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
        headers={"Origin": "http://localhost:5173", **TEST_CSRF_HEADERS},
    )
    assert login_response.status_code == 200

    refresh_response = auth_client.post(
        "/auth/refresh",
        headers={"Origin": "http://localhost:5173", **TEST_CSRF_HEADERS},
    )

    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"]


def test_cookie_auth_posts_reject_allowed_origin_without_csrf_header(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "csrf header required"}


def test_refresh_rejects_missing_invalid_and_deleted_user_cookie(
    auth_client: TestClient,
    db_session: Session,
) -> None:
    missing_response = auth_client.post("/auth/refresh")
    assert missing_response.status_code == 401
    assert missing_response.json() == {"detail": "refresh token required"}

    auth_client.cookies.set("gcs_saker_refresh", "not-a-token")
    invalid_response = auth_client.post("/auth/refresh")
    assert invalid_response.status_code == 401
    assert invalid_response.json() == {"detail": "invalid token"}

    ghost_token = create_refresh_token(
        "deleted-user",
        "viewer",
        settings=AuthSettings(secret=TEST_AUTH_SECRET),
    )
    auth_client.cookies.set("gcs_saker_refresh", ghost_token)
    deleted_response = auth_client.post("/auth/refresh")
    assert deleted_response.status_code == 401
    assert deleted_response.json() == {"detail": "invalid refresh session"}
    assert "Max-Age=0" in deleted_response.headers["set-cookie"]
    assert db_session.query(User).filter(User.username == "deleted-user").first() is None


def test_logout_clears_refresh_cookie(auth_client: TestClient) -> None:
    login_response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "correct-password"},
    )
    assert login_response.status_code == 200

    logout_response = auth_client.post("/auth/logout")

    assert logout_response.status_code == 204
    assert "gcs_saker_refresh=" in logout_response.headers["set-cookie"]
    assert "Max-Age=0" in logout_response.headers["set-cookie"]


def test_login_rejects_invalid_credentials(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_signup_hashes_password_and_ignores_client_supplied_role(
    auth_client: TestClient,
    db_session: Session,
) -> None:
    response = auth_client.post(
        "/auth/signup",
        json={
            "username": "viewer02",
            "email": "viewer02@example.com",
            "password": "strong-password",
            "inviteCode": "A4AI01",
            "role": "admin",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["username"] == "viewer02"
    assert payload["email"] == "viewer02@example.com"
    assert payload["company_id"] == 1
    assert payload["role"] == "viewer"
    assert "password" not in payload
    assert "password_hash" not in payload

    created_user = db_session.query(User).filter(User.username == "viewer02").one()
    assert created_user.password_hash != "strong-password"
    assert "strong-password" not in created_user.password_hash
    assert created_user.password_hash.startswith("$pbkdf2-sha256$")


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        (
            {
                "username": "operator01",
                "email": "new-operator@example.com",
                "password": "strong-password",
                "inviteCode": "A4AI01",
                "role": "viewer",
            },
            "Username already registered",
        ),
        (
            {
                "username": "newoperator",
                "email": "operator01@example.com",
                "password": "strong-password",
                "inviteCode": "A4AI01",
                "role": "viewer",
            },
            "Email already registered",
        ),
        (
            {
                "username": "newoperator",
                "email": "new-operator@example.com",
                "password": "strong-password",
                "inviteCode": "WRONG-CODE",
                "role": "viewer",
            },
            "Invalid invite code Input",
        ),
    ],
)
def test_signup_rejects_duplicate_or_invalid_invite(
    auth_client: TestClient,
    payload: dict[str, str],
    detail: str,
) -> None:
    response = auth_client.post("/auth/signup", json=payload)

    assert response.status_code == 400
    assert response.json() == {"detail": detail}


def test_signup_duplicate_email_uses_one_user_lookup(
    auth_client: TestClient,
    db_session: Session,
) -> None:
    select_statements: list[str] = []
    bind = db_session.get_bind()

    def record_selects(conn, cursor, statement, parameters, context, executemany) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            select_statements.append(statement)

    event.listen(bind, "before_cursor_execute", record_selects)
    try:
        response = auth_client.post(
            "/auth/signup",
            json={
                "username": "newoperator",
                "email": "operator01@example.com",
                "password": "strong-password",
                "inviteCode": "A4AI01",
                "role": "viewer",
            },
        )
    finally:
        event.remove(bind, "before_cursor_execute", record_selects)

    assert response.status_code == 400
    assert response.json() == {"detail": "Email already registered"}
    assert len(select_statements) == 1
    assert "EXISTS" in select_statements[0].upper()
    assert "password_hash" not in select_statements[0]
    assert "company_id" not in select_statements[0]


def test_login_selects_only_authentication_columns(
    auth_client: TestClient,
    db_session: Session,
) -> None:
    select_statements: list[str] = []
    bind = db_session.get_bind()

    def record_selects(conn, cursor, statement, parameters, context, executemany) -> None:
        if statement.lstrip().upper().startswith("SELECT"):
            select_statements.append(statement)

    event.listen(bind, "before_cursor_execute", record_selects)
    try:
        response = auth_client.post(
            "/auth/login",
            json={"username": "operator01", "password": "correct-password"},
        )
    finally:
        event.remove(bind, "before_cursor_execute", record_selects)

    assert response.status_code == 200
    login_select = select_statements[0]
    assert "users.username" in login_select
    assert "users.password_hash" in login_select
    assert "users.role" in login_select
    assert "users.email" not in login_select
    assert "users.company_id" not in login_select


def test_auth_me_reports_missing_invalid_and_expired_tokens(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    with TestClient(app) as client:
        missing_response = client.get("/auth/me")
        assert missing_response.status_code == 401
        assert missing_response.json() == {"detail": "authentication required"}

        invalid_response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-token"})
        assert invalid_response.status_code == 401
        assert invalid_response.json() == {"detail": "invalid token"}

        expired_token = create_access_token(
            "operator01",
            "operator",
            settings=AuthSettings(secret=TEST_AUTH_SECRET),
            expires_delta=timedelta(seconds=-1),
        )
        expired_response = client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert expired_response.status_code == 401
        assert expired_response.json() == {"detail": "token expired"}

        valid_response = client.get("/auth/me", headers=auth_headers("viewer01", "viewer"))
        assert valid_response.status_code == 200
        assert valid_response.json() == {"username": "viewer01", "role": "viewer"}


def test_stream_api_requires_authentication_and_accepts_viewer_token(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    with TestClient(app) as client:
        missing_response = client.get("/api/v1/streams")
        assert missing_response.status_code == 401

        viewer_response = client.get("/api/v1/streams", headers=auth_headers("viewer01", "viewer"))
        assert viewer_response.status_code == 200
        assert viewer_response.json()[0]["streamId"] == "raw.sample.front"


def test_control_api_requires_operator_role(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        viewer_response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("viewer01", "viewer"),
        )
        assert viewer_response.status_code == 403
        assert viewer_response.json() == {"detail": "operator role required"}

        operator_response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("operator01", "operator"),
        )
        assert operator_response.status_code == 200
        assert operator_response.json()["status"] == "sent"
        assert published == [("robot/control/CID001", "stop")]

    app.dependency_overrides.pop(get_control_message_publisher, None)


def test_control_api_can_publish_protobuf_v2_command_payload(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json={
                "cid": "CID001",
                "direction": "stop",
                "payload_format": "protobuf",
                "org_id": "a4ai",
                "group_id": "co-a",
                "stream_id": "raw.mobile.front",
            },
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 200
    assert response.json()["topic"] == "gcs/a4ai/co-a/CID001/command"
    assert len(published) == 1
    assert published[0][0] == "gcs/a4ai/co-a/CID001/command"
    assert isinstance(published[0][1], bytes)
    app.dependency_overrides.pop(get_control_message_publisher, None)


def test_control_api_returns_503_when_selected_sender_is_unavailable(
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(FailingMessageSender())

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json={"cid": "CID001", "direction": "stop"},
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "gRPC gateway target is not configured"}
    app.dependency_overrides.pop(get_control_message_publisher, None)


@pytest.mark.parametrize(
    "payload",
    [
        {"cid": "CID001", "direction": "stop; rm -rf /"},
        {"cid": "../CID001", "direction": "stop"},
        {"cid": "CID001/../../x", "direction": "stop"},
    ],
)
def test_control_api_rejects_untrusted_command_payloads(
    auth_headers: Callable[[str, str], dict[str, str]],
    payload: dict[str, str],
) -> None:
    published: list[tuple[str, str | bytes]] = []
    app.dependency_overrides[get_control_message_publisher] = lambda: ControlMessagePublisher(
        RecordingMessageSender(published)
    )

    with TestClient(app) as client:
        response = client.post(
            "/control/",
            json=payload,
            headers=auth_headers("operator01", "operator"),
        )

    assert response.status_code == 422
    assert published == []
    app.dependency_overrides.pop(get_control_message_publisher, None)
