from dataclasses import dataclass
from typing import Literal

HealthStatus = Literal["ok", "degraded", "error"]


@dataclass(frozen=True)
class HealthCheckResult:
    name: str
    status: HealthStatus
    required: bool = True
    reason: str | None = None

    @property
    def is_ok(self) -> bool:
        return self.status == "ok"


@dataclass(frozen=True)
class HealthReport:
    service: str
    status: HealthStatus
    checks: tuple[HealthCheckResult, ...]

    @classmethod
    def from_checks(cls, service: str, checks: tuple[HealthCheckResult, ...]) -> "HealthReport":
        required_failed = any(check.required and not check.is_ok for check in checks)
        optional_failed = any((not check.required) and not check.is_ok for check in checks)
        if required_failed:
            status: HealthStatus = "error"
        elif optional_failed:
            status = "degraded"
        else:
            status = "ok"
        return cls(service=service, status=status, checks=checks)

    @property
    def is_ready(self) -> bool:
        return self.status == "ok"
