from collections.abc import Awaitable, Callable

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from api import auth, control, event, health, stream, telemetry, unmaned_assets
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
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.middleware("http")
async def add_security_headers(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self)")
    response.headers.setdefault("Content-Security-Policy", web_security_settings.content_security_policy)
    return response

# 📦 API 라우터 등록
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(health.router, tags=["Health"])
app.include_router(stream.router, prefix="/stream", tags=["Stream"])
app.include_router(
    stream.v1_router,
    prefix="/api/v1",
    tags=["Stream"],
    dependencies=[Depends(require_role("viewer"))],
)
app.include_router(
    mock_ai_router,
    prefix="/api/v1",
    tags=["AI Mock"],
    dependencies=[Depends(require_role("operator"))],
)
app.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry"])
app.include_router(
    control.router,
    prefix="/control",
    tags=["Control"],
    dependencies=[Depends(require_role("operator"))],
)
app.include_router(
    unmaned_assets.router,
    prefix="/asset",
    tags=["Asset"],
    dependencies=[Depends(require_role("viewer"))],
)
#pp.include_router(event.router, prefix="/event", tags=["Event"])  # 옵션

@app.get("/")
def read_root():
    return {"message": "🛰️ GCS Backend API Running"}


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# 🔧 uvicorn 실행 시 진입점 예시:
# uvicorn main:app --reload
