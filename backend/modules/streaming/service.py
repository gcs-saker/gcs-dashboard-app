from modules.streaming.domain import PlaybackUrls, StreamDescriptor, StreamingModuleStatus, StreamStatus
from modules.streaming.playback_url_builder import PlaybackUrlBuilder
from modules.streaming.repository import StreamRepository
from modules.streaming.seeds import build_seed_repository


class StreamingService:
    def __init__(
        self,
        repository: StreamRepository | None = None,
        playback_url_builder: PlaybackUrlBuilder | None = None,
    ) -> None:
        self.playback_url_builder = playback_url_builder or PlaybackUrlBuilder.from_env()
        self.repository = repository or build_seed_repository(self.playback_url_builder)

    def module_status(self) -> StreamingModuleStatus:
        return StreamingModuleStatus(
            registry_ready=True,
            playback_url_builder_ready=True,
            registered_streams=len(self.repository.list()),
        )

    def list_registered_streams(self) -> list[StreamDescriptor]:
        return self.repository.list()

    def get_registered_stream(self, stream_id: str) -> StreamDescriptor | None:
        return self.repository.get(stream_id)

    def build_playback_urls(self, stream_id: str) -> PlaybackUrls:
        return self.playback_url_builder.build_from_stream_id(stream_id)

    def register_stream_path(
        self,
        path: str,
        *,
        status: StreamStatus = "registered",
        display_name: str | None = None,
    ) -> StreamDescriptor:
        descriptor = StreamDescriptor.from_path(
            path,
            status=status,
            display_name=display_name,
        )
        descriptor = StreamDescriptor(
            stream_path=descriptor.stream_path,
            status=descriptor.status,
            display_name=descriptor.display_name,
            playback_urls=self.playback_url_builder.build(descriptor.stream_path),
        )
        return self.repository.upsert(descriptor)
