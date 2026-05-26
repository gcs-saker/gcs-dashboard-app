from pydantic import BaseModel

from modules.health.domain import HealthCheckResult, HealthReport, HealthStatus


class HealthCheckResponse(BaseModel):
    name: str
    status: HealthStatus
    required: bool
    reason: str | None = None

    @classmethod
    def from_domain(cls, check: HealthCheckResult) -> "HealthCheckResponse":
        return cls(
            name=check.name,
            status=check.status,
            required=check.required,
            reason=check.reason,
        )


class HealthReportResponse(BaseModel):
    service: str
    status: HealthStatus
    checks: list[HealthCheckResponse]

    @classmethod
    def from_domain(cls, report: HealthReport) -> "HealthReportResponse":
        return cls(
            service=report.service,
            status=report.status,
            checks=[HealthCheckResponse.from_domain(check) for check in report.checks],
        )
