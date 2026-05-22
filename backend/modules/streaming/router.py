from fastapi import APIRouter, HTTPException

from model.stream_model import StreamPathError
from modules.streaming.playback_url_builder import PlaybackUrlBuilderError
from modules.streaming.schemas import (
    PlaybackUrlsResponse,
    StreamDescriptorResponse,
    StreamingModuleStatusResponse,
)
from modules.streaming.service import StreamingService

router = APIRouter()
default_streaming_service = StreamingService()


@router.get("/status", response_model=StreamingModuleStatusResponse)
async def get_streaming_module_status() -> StreamingModuleStatusResponse:
    return StreamingModuleStatusResponse.from_domain(default_streaming_service.module_status())


@router.get("/playback/{stream_id}", response_model=PlaybackUrlsResponse)
async def get_playback_urls(stream_id: str) -> PlaybackUrlsResponse:
    try:
        playback_urls = default_streaming_service.build_playback_urls(stream_id)
    except (StreamPathError, PlaybackUrlBuilderError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PlaybackUrlsResponse.from_domain(playback_urls)


@router.get("/registry", response_model=list[StreamDescriptorResponse])
async def list_stream_registry() -> list[StreamDescriptorResponse]:
    return [
        StreamDescriptorResponse.from_domain(descriptor)
        for descriptor in default_streaming_service.list_registered_streams()
    ]


@router.get("/registry/{stream_id}", response_model=StreamDescriptorResponse)
async def get_stream_registry_item(stream_id: str) -> StreamDescriptorResponse:
    descriptor = default_streaming_service.get_registered_stream(stream_id)
    if descriptor is None:
        raise HTTPException(status_code=404, detail="stream is not registered")
    return StreamDescriptorResponse.from_domain(descriptor)
