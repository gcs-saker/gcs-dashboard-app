from abc import ABC, abstractmethod
from typing import Annotated, Generic, TypeAlias, TypeVar

from fastapi import APIRouter, Depends

from api.contracts import StreamErrorDetails, StreamRoutes, StreamStatusProtocol
from api.errors import NotFoundApiError, UnprocessableEntityApiError
from config import WebRtcIceSettings
from model.stream_model import StreamPathError, validate_stream_id, validate_stream_path
from modules.streaming.domain import StreamDescriptor
from modules.streaming.router import router as streaming_module_router
from modules.streaming.schemas import (
    IceServerResponse,
    StreamDescriptorResponse,
    StreamPlaybackResponse,
    StreamStatusResponse,
)
from modules.streaming.service import StreamingService

StreamResponseT = TypeVar("StreamResponseT")

router = APIRouter()
router.include_router(streaming_module_router, prefix=StreamRoutes.MODULE_PREFIX)
v1_router = APIRouter()
v1_streaming_service = StreamingService()


def get_v1_streaming_service() -> StreamingService:
    return v1_streaming_service


StreamServiceDependency: TypeAlias = Annotated[
    StreamingService,
    Depends(get_v1_streaming_service),
]


class StreamLookupOperation(ABC, Generic[StreamResponseT]):
    def __init__(self, service: StreamingService, stream_id: str) -> None:
        self.service = service
        self.stream_id = stream_id

    def execute(self) -> StreamResponseT:
        try:
            descriptor = self._require_registered_stream()
        except StreamPathError as exc:
            raise UnprocessableEntityApiError(str(exc)) from exc
        return self.build_response(descriptor)

    def _require_registered_stream(self) -> StreamDescriptor:
        stream_path = validate_stream_id(self.stream_id)
        descriptor = self.service.get_registered_stream(stream_path.stream_id)
        if descriptor is None:
            raise NotFoundApiError(StreamErrorDetails.STREAM_NOT_REGISTERED)
        return descriptor

    @abstractmethod
    def build_response(self, descriptor: StreamDescriptor) -> StreamResponseT:
        raise NotImplementedError


class StreamDetailOperation(StreamLookupOperation[StreamDescriptorResponse]):
    def build_response(self, descriptor: StreamDescriptor) -> StreamDescriptorResponse:
        return StreamDescriptorResponse.from_domain(descriptor)


class StreamPlaybackOperation(StreamLookupOperation[StreamPlaybackResponse]):
    def build_response(self, descriptor: StreamDescriptor) -> StreamPlaybackResponse:
        return StreamPlaybackResponse.from_domain(descriptor)


class StreamStatusOperation(StreamLookupOperation[StreamStatusResponse]):
    def build_response(self, descriptor: StreamDescriptor) -> StreamStatusResponse:
        return StreamStatusResponse.from_domain(descriptor)


@v1_router.get(StreamRoutes.STREAMS, response_model=list[StreamDescriptorResponse])
async def list_streams(service: StreamServiceDependency) -> list[StreamDescriptorResponse]:
    return [StreamDescriptorResponse.from_domain(descriptor) for descriptor in service.list_registered_streams()]


@v1_router.get(StreamRoutes.ICE_SERVERS, response_model=list[IceServerResponse])
async def list_stream_ice_servers() -> list[IceServerResponse]:
    return [IceServerResponse(**server) for server in WebRtcIceSettings.from_env().browser_ice_servers()]


@v1_router.get(StreamRoutes.PLAYBACK, response_model=StreamPlaybackResponse)
async def get_stream_playback(
    stream_id: str,
    service: StreamServiceDependency,
) -> StreamPlaybackResponse:
    return StreamPlaybackOperation(service, stream_id).execute()


@v1_router.get(StreamRoutes.STREAM_STATUS, response_model=StreamStatusResponse)
async def get_stream_status(
    stream_id: str,
    service: StreamServiceDependency,
) -> StreamStatusResponse:
    return StreamStatusOperation(service, stream_id).execute()


@v1_router.get(StreamRoutes.STREAM_DETAIL, response_model=StreamDescriptorResponse)
async def get_stream(
    stream_id: str,
    service: StreamServiceDependency,
) -> StreamDescriptorResponse:
    return StreamDetailOperation(service, stream_id).execute()


@router.get(StreamRoutes.STATUS)
async def stream_status():
    return {StreamStatusProtocol.FIELD_STREAM: StreamStatusProtocol.READY}


@router.get(StreamRoutes.PATH_FROM_ID)
async def resolve_stream_id(stream_id: str):
    try:
        return validate_stream_id(stream_id).to_api_dict()
    except StreamPathError as exc:
        raise UnprocessableEntityApiError(str(exc)) from exc


@router.get(StreamRoutes.PATH_FROM_PATH)
async def resolve_stream_path(stream_path: str):
    try:
        return validate_stream_path(stream_path).to_api_dict()
    except StreamPathError as exc:
        raise UnprocessableEntityApiError(str(exc)) from exc
