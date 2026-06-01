from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from api import auth, control, event, health, stream, telemetry, unmaned_assets
from api.contracts import (
    MetricsProtocol,
    RootRoutes,
    RouterPrefixes,
    SecurityHeaderNames,
    SecurityHeaderValues,
)
from config import WebSecuritySettings
from core.security import require_role
from modules.ai_contract.router import router as mock_ai_router
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

app = FastAPI(
    title="GCS Backend API",
    description="드론/로봇 제어 및 영상 처리 백엔드",
    version="1.0.0",
)

web_security_settings = WebSecuritySettings.from_env()

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(web_security_settings.allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        SecurityHeaderNames.AUTHORIZATION,
        SecurityHeaderNames.CONTENT_TYPE,
        SecurityHeaderNames.ACCEPT,
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
    response.headers.setdefault(SecurityHeaderNames.CONTENT_SECURITY_POLICY, web_security_settings.content_security_policy)
    return response

# 📦 API 라우터 등록
app.include_router(auth.router, prefix=RouterPrefixes.AUTH, tags=["auth"])
app.include_router(health.router, tags=["Health"])
app.include_router(stream.router, prefix=RouterPrefixes.STREAM_LEGACY, tags=["Stream"])
app.include_router(
    stream.v1_router,
    prefix=RouterPrefixes.API_V1,
    tags=["Stream"],
    dependencies=[Depends(require_role("viewer"))],
)
app.include_router(
    mock_ai_router,
    prefix=RouterPrefixes.API_V1,
    tags=["AI Mock"],
    dependencies=[Depends(require_role("operator"))],
)
app.include_router(telemetry.router, prefix=RouterPrefixes.TELEMETRY, tags=["Telemetry"])
app.include_router(
    control.router,
    prefix=RouterPrefixes.CONTROL,
    tags=["Control"],
    dependencies=[Depends(require_role("operator"))],
)
app.include_router(
    unmaned_assets.router,
    prefix=RouterPrefixes.ASSET,
    tags=["Asset"],
    dependencies=[Depends(require_role("viewer"))],
)
#pp.include_router(event.router, prefix="/event", tags=["Event"])  # 옵션

@app.get(RootRoutes.ROOT)
def read_root():
    return {"message": MetricsProtocol.ROOT_MESSAGE}


@app.get(RootRoutes.METRICS, include_in_schema=False)
def prometheus_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# 🔧 uvicorn 실행 시 진입점 예시:
# uvicorn main:app --reload
