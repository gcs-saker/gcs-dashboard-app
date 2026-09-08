from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from api.auth import get_password_hash
from api.contracts import AuthProtocol
from core.db import Base, get_db
from main import app
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
