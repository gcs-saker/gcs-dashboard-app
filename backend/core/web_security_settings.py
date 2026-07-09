from __future__ import annotations

import os
from dataclasses import dataclass

from core.env_parsing import csv_to_tuple, empty_to_none

DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
)

DEFAULT_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://unpkg.com; "
    "img-src 'self' data: blob: https://tiles.openfreemap.org https://services.arcgisonline.com; "
    "connect-src 'self' https: wss:; "
    "media-src 'self' blob: https:; "
    "worker-src 'self' blob:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'"
)


@dataclass(frozen=True)
class WebSecuritySettings:
    allowed_origins: tuple[str, ...]
    content_security_policy: str

    @classmethod
    def from_env(cls) -> "WebSecuritySettings":
        configured_origins = csv_to_tuple(os.getenv("BACKEND_CORS_ALLOW_ORIGINS"))
        configured_csp = empty_to_none(os.getenv("BACKEND_CONTENT_SECURITY_POLICY"))
        return cls(
            allowed_origins=configured_origins or DEFAULT_ALLOWED_ORIGINS,
            content_security_policy=configured_csp or DEFAULT_CONTENT_SECURITY_POLICY,
        )
