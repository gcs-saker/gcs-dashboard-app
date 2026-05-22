from pydantic import BaseModel, ConfigDict, Field

from modules.streaming.domain import PlaybackUrls, StreamDescriptor, StreamingModuleStatus, StreamStatus


class PlaybackUrlsResponse(BaseModel):
    webrtc: str | None = None
    hls: str | None = None

    @classmethod
    def from_domain(cls, playback_urls: PlaybackUrls) -> "PlaybackUrlsResponse":
        return cls(webrtc=playback_urls.webrtc, hls=playback_urls.hls)


class StreamDescriptorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    stream_id: str = Field(alias="streamId")
    path: str
    prefix: str
    asset_id: str = Field(alias="assetId")
    sensor_id: str = Field(alias="sensorId")
    processor_id: str | None = Field(default=None, alias="processorId")
    date: str | None = None
    status: StreamStatus
    display_name: str | None = Field(default=None, alias="displayName")
    playback_urls: PlaybackUrlsResponse = Field(alias="playbackUrls")

    @classmethod
    def from_domain(cls, descriptor: StreamDescriptor) -> "StreamDescriptorResponse":
        stream_path = descriptor.stream_path
        return cls(
            streamId=descriptor.stream_id,
            path=descriptor.path,
            prefix=stream_path.prefix,
            assetId=stream_path.asset_id,
            sensorId=stream_path.sensor_id,
            processorId=stream_path.processor_id,
            date=stream_path.archive_date,
            status=descriptor.status,
            displayName=descriptor.display_name,
            playbackUrls=PlaybackUrlsResponse.from_domain(descriptor.playback_urls),
        )


class StreamingModuleStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    registry_ready: bool = Field(alias="registryReady")
    playback_url_builder_ready: bool = Field(alias="playbackUrlBuilderReady")
    registered_streams: int = Field(alias="registeredStreams")

    @classmethod
    def from_domain(cls, status: StreamingModuleStatus) -> "StreamingModuleStatusResponse":
        return cls(
            registryReady=status.registry_ready,
            playbackUrlBuilderReady=status.playback_url_builder_ready,
            registeredStreams=status.registered_streams,
        )
