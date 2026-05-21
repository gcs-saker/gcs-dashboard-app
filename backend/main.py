from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import stream, telemetry, control, event, auth, unmaned_assets
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(
    title="GCS Backend API",
    description="드론/로봇 제어 및 영상 처리 백엔드",
    version="1.0.0",
)

# 📊 Prometheus Metrics 등록 (앱 실행 전에 해야 함)
instrumentator = Instrumentator().instrument(app)
instrumentator.expose(app)

# 🔓 CORS 설정 (로컬 프론트엔드 React와 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 운영 시 프론트엔드 주소로 변경 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 📦 API 라우터 등록
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(stream.router, prefix="/stream", tags=["Stream"])
app.include_router(telemetry.router, prefix="/telemetry", tags=["Telemetry"])
app.include_router(control.router, prefix="/control", tags=["Control"])
app.include_router(unmaned_assets.router, prefix="/asset", tags=["Asset"])
#pp.include_router(event.router, prefix="/event", tags=["Event"])  # 옵션

@app.get("/")
def read_root():
    return {"message": "🛰️ GCS Backend API Running"}


# 🔧 uvicorn 실행 시 진입점 예시:
# uvicorn main:app --reload
