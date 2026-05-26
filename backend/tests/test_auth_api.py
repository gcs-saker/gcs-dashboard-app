from collections.abc import Callable, Generator
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from api import control
from api.auth import get_password_hash
from core.db import Base, get_db
from core.security import AuthSettings, create_access_token
from main import app
from sql.company_sql import Company
from sql.user_sql import User

TEST_AUTH_SECRET = "test-auth-secret-for-gcs-saker-at-least-32-characters"


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
            email="operator01@example.test",
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

    me_response = auth_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token_payload['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json() == {"username": "operator01", "role": "operator"}


def test_login_rejects_invalid_credentials(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/auth/login",
        json={"username": "operator01", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


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
    monkeypatch,
    auth_headers: Callable[[str, str], dict[str, str]],
) -> None:
    published: list[tuple[str, str]] = []

    def fake_publish(topic: str, command: str) -> None:
        published.append((topic, command))

    monkeypatch.setattr(control, "publish_control_command", fake_publish)

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
