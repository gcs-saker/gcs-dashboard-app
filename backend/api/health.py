from collections.abc import Callable
from typing import Annotated, Protocol

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text

from api.contracts import HealthRoutes
from api.stream import StreamServiceDependency
from core.db import engine
from modules.health.domain import HealthCheckResult, HealthReport
from modules.health.schemas import HealthReportResponse

router = APIRouter()
SERVICE_NAME = "gcs-backend"


class DatabaseProbe(Protocol):
    def __call__(self) -> bool:
        raise NotImplementedError


def default_database_probe() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True


def get_database_probe() -> DatabaseProbe:
    return default_database_probe


DatabaseProbeDependency = Annotated[DatabaseProbe, Depends(get_database_probe)]


@router.get(HealthRoutes.HEALTHZ, response_model=HealthReportResponse)
async def healthz() -> HealthReportResponse:
    report = HealthReport.from_checks(
        SERVICE_NAME,
        (
            HealthCheckResult(name="api", status="ok", required=True),
        ),
    )
    return HealthReportResponse.from_domain(report)


@router.get(HealthRoutes.READYZ, response_model=HealthReportResponse)
async def readyz(
    response: Response,
    service: StreamServiceDependency,
    database_probe: DatabaseProbeDependency,
) -> HealthReportResponse:
    checks = (
        _database_check(database_probe),
        *_streaming_checks(service.module_status),
    )
    report = HealthReport.from_checks(SERVICE_NAME, checks)
    if not report.is_ready:
        response.status_code = 503
    return HealthReportResponse.from_domain(report)


def _database_check(database_probe: DatabaseProbe) -> HealthCheckResult:
    try:
        database_probe()
    except Exception:
        return HealthCheckResult(
            name="database",
            status="error",
            required=True,
            reason="database readiness query failed",
        )
    return HealthCheckResult(name="database", status="ok", required=True)


def _streaming_checks(module_status_factory: Callable[[], object]) -> tuple[HealthCheckResult, ...]:
    try:
        module_status = module_status_factory()
        registry_ready = bool(getattr(module_status, "registry_ready"))
        playback_ready = bool(getattr(module_status, "playback_url_builder_ready"))
    except Exception:
        return (
            HealthCheckResult(
                name="streaming",
                status="error",
                required=True,
                reason="streaming status check failed",
            ),
        )

    return (
        HealthCheckResult(
            name="streaming_registry",
            status="ok" if registry_ready else "error",
            required=True,
            reason=None if registry_ready else "stream registry is not ready",
        ),
        HealthCheckResult(
            name="playback_url_builder",
            status="ok" if playback_ready else "error",
            required=True,
            reason=None if playback_ready else "playback url builder is not ready",
        ),
    )
