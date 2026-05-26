from collections.abc import Callable

import pytest

from core.security import AuthSettings, create_access_token

TEST_AUTH_SECRET = "test-auth-secret-for-gcs-saker-at-least-32-characters"


@pytest.fixture(autouse=True)
def auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH_JWT_SECRET", TEST_AUTH_SECRET)
    monkeypatch.setenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    monkeypatch.setenv("AUTH_JWT_ISSUER", "gcs-saker")


@pytest.fixture
def auth_headers() -> Callable[[str, str], dict[str, str]]:
    def build_headers(username: str = "test-operator", role: str = "operator") -> dict[str, str]:
        token = create_access_token(
            username,
            role,
            settings=AuthSettings(secret=TEST_AUTH_SECRET),
        )
        return {"Authorization": f"Bearer {token}"}

    return build_headers
