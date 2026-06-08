from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from api.map_config import get_map_config_service
from config import DashboardMapSettings
from main import app
from modules.map_config import MapConfigService


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_map_config_service] = lambda: MapConfigService(
        DashboardMapSettings(
            provider="esri-satellite",
            style_url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            attribution="Esri World Imagery",
            requires_api_key=False,
        )
    )

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_map_config_api_returns_provider_contract(client: TestClient, auth_headers):
    response = client.get("/api/v1/map/config", headers=auth_headers("viewer01", "viewer"))

    assert response.status_code == 200
    assert response.json() == {
        "provider": "esri-satellite",
        "styleUrl": "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "attribution": "Esri World Imagery",
        "requiresApiKey": False,
    }


def test_map_config_api_requires_viewer_auth(client: TestClient):
    response = client.get("/api/v1/map/config")

    assert response.status_code == 401


def test_map_config_settings_can_be_overridden_by_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DASHBOARD_MAP_PROVIDER", "custom")
    monkeypatch.setenv("DASHBOARD_MAP_STYLE_URL", "https://maps.example.test/style.json")
    monkeypatch.setenv("DASHBOARD_MAP_ATTRIBUTION", "Example Maps")
    monkeypatch.setenv("DASHBOARD_MAP_REQUIRES_API_KEY", "true")

    settings = DashboardMapSettings.from_env()
    config = MapConfigService(settings).get_config()

    assert config.model_dump(by_alias=True) == {
        "provider": "custom",
        "styleUrl": "https://maps.example.test/style.json",
        "attribution": "Example Maps",
        "requiresApiKey": True,
    }
