from fastapi import APIRouter, HTTPException

from model.stream_model import StreamPathError, validate_stream_id, validate_stream_path
from modules.streaming.router import router as streaming_module_router

router = APIRouter()
router.include_router(streaming_module_router, prefix="/module")


@router.get("/status")
async def stream_status():
    return {"stream": "ready"}


@router.get("/paths/from-id/{stream_id}")
async def resolve_stream_id(stream_id: str):
    try:
        return validate_stream_id(stream_id).to_api_dict()
    except StreamPathError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/paths/from-path/{stream_path:path}")
async def resolve_stream_path(stream_path: str):
    try:
        return validate_stream_path(stream_path).to_api_dict()
    except StreamPathError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
