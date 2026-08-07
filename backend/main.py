from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from api import auth, control, health, map_config, stream, telemetry, unmaned_assets
from api.contracts import (
    LegacyRouteContract,
    MetricsProtocol,
    RootRoutes,
    RouterPrefixes,
    SecurityHeaderNames,
    SecurityHeaderValues,
)
from config import WebSecuritySettings
from core.security import require_role
from core.security_contract import ROLE_ADMIN, ROLE_OPERATOR, ROLE_VIEWER
from core.structured_logging import (
    StructuredLoggingSettings,
    configure_structured_logging,
    get_logger,
    log_request_completed,
    log_request_failed,
)
from core.tracing import TracingSettings, configure_global_tracing, trace_fastapi_request
from modules.ai_adapter.router import router as ai_adapter_router
from modules.ai_contract.router import router as mock_ai_router
from mqtt.subscriber import start_optional_telemetry_subscriber


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_optional_telemetry_subscriber(app)
    yield


app = FastAPI(
    title="GCS Backend API",
    description="드론/로봇 제어 및 영상 처리 백엔드",
    version="1.0.0",
    lifespan=lifespan,
)

web_security_settings = WebSecuritySettings.from_env()
tracing_settings = TracingSettings.from_env()
tracer_provider = configure_global_tracing(tracing_settings)
structured_logging_settings = StructuredLoggingSettings.from_env()
configure_structured_logging(structured_logging_settings)
request_logger = get_logger("python-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(web_security_settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        SecurityHeaderNames.AUTHORIZATION,
        SecurityHeaderNames.CONTENT_TYPE,
        SecurityHeaderNames.ACCEPT,
        SecurityHeaderNames.X_GCS_CSRF,
    ],
)


@app.middleware("http")
async def add_security_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    response.headers.setdefault(SecurityHeaderNames.X_CONTENT_TYPE_OPTIONS, SecurityHeaderValues.NOSNIFF)
    response.headers.setdefault(SecurityHeaderNames.X_FRAME_OPTIONS, SecurityHeaderValues.DENY)
    response.headers.setdefault(SecurityHeaderNames.REFERRER_POLICY, SecurityHeaderValues.NO_REFERRER)
    response.headers.setdefault(SecurityHeaderNames.PERMISSIONS_POLICY, SecurityHeaderValues.SELF_DEVICE_PERMISSIONS)
    response.headers.setdefault(
        SecurityHeaderNames.CONTENT_SECURITY_POLICY, web_security_settings.content_security_policy
    )
    mark_legacy_route(request, response)
    return response


@app.middleware("http")
async def add_trace_span(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    return await trace_fastapi_request(
        request,
        call_next,
        settings=tracing_settings,
        provider=tracer_provider,
    )


@app.middleware("http")
async def add_structured_request_log(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    try:
        response = await call_next(request)
    except Exception as exc:
        log_request_failed(request_logger, request, exc)
        raise
    log_request_completed(request_logger, request, response)
    return response


def mark_legacy_route(request: Request, response: Response) -> None:
    replacement = replacement_for_legacy_path(request.url.path)
    if replacement is None:
        return
    response.headers.setdefault(SecurityHeaderNames.DEPRECATION, SecurityHeaderValues.TRUE)
    response.headers.setdefault(SecurityHeaderNames.X_GCS_LEGACY_FALLBACK, SecurityHeaderValues.LEGACY_FALLBACK_DIRECT)
    response.headers.setdefault(SecurityHeaderNames.X_GCS_REPLACEMENT_ROUTE, replacement)


def replacement_for_legacy_path(path: str) -> str | None:
    if path in LegacyRouteContract.REPLACEMENTS:
        return LegacyRouteContract.REPLACEMENTS[path]
    for prefix in LegacyRouteContract.MARKED_PREFIXES:
        if path == prefix or path.startswith(f"{prefix}/"):
            return LegacyRouteContract.REPLACEMENTS[prefix]
    return None


# 📦 API 라우터 등록
app.include_router(auth.router, prefix=RouterPrefixes.AUTH, tags=["auth"])
app.include_router(health.router, tags=["Health"])
app.include_router(stream.router, prefix=RouterPrefixes.STREAM_LEGACY, tags=["Stream"])
app.include_router(
    stream.v1_router,
    prefix=RouterPrefixes.API_V1,
    tags=["Stream"],
    dependencies=[Depends(require_role(ROLE_VIEWER))],
)
app.include_router(
    map_config.router,
    prefix=RouterPrefixes.API_V1,
    tags=["Map"],
    dependencies=[Depends(require_role(ROLE_VIEWER))],
)
app.include_router(
    mock_ai_router,
    prefix=RouterPrefixes.API_V1,
    tags=["AI Mock"],
    dependencies=[Depends(require_role(ROLE_OPERATOR))],
)
app.include_router(
    ai_adapter_router,
    prefix=RouterPrefixes.API_V1,
    dependencies=[Depends(require_role(ROLE_ADMIN))],
)
app.include_router(telemetry.router, prefix=RouterPrefixes.TELEMETRY, tags=["Telemetry"])
app.include_router(
    control.router,
    prefix=RouterPrefixes.CONTROL,
    tags=["Control"],
    dependencies=[Depends(require_role(ROLE_OPERATOR))],
)
app.include_router(
    unmaned_assets.router,
    prefix=RouterPrefixes.ASSET,
    tags=["Asset"],
    dependencies=[Depends(require_role(ROLE_VIEWER))],
)
# pp.include_router(event.router, prefix="/event", tags=["Event"])  # 옵션


@app.get(RootRoutes.ROOT)
def read_root():
    return {"message": MetricsProtocol.ROOT_MESSAGE}


@app.get(RootRoutes.METRICS, include_in_schema=False)
def prometheus_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# 🔧 uvicorn 실행 시 진입점 예시:
# uvicorn main:app --reload
