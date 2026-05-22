from fastapi import APIRouter, HTTPException

from modules.streaming.schemas import StreamDescriptorResponse, StreamingModuleStatusResponse
from modules.streaming.service import StreamingService

router = APIRouter()
default_streaming_service = StreamingService()


@router.get("/status", response_model=StreamingModuleStatusResponse)
async def get_streaming_module_status() -> StreamingModuleStatusResponse:
    return StreamingModuleStatusResponse.from_domain(default_streaming_service.module_status())


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
