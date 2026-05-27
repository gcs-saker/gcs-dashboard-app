from modules.streaming.domain import PlaybackUrls, StreamDescriptor, StreamingModuleStatus, StreamStatus
from modules.streaming.mediamtx_client import MediaMTXClient, MediaMTXClientError, MediaMTXPath
from modules.streaming.playback_url_builder import PlaybackUrlBuilder
from modules.streaming.repository import StreamRepository
from modules.streaming.seeds import build_seed_repository


class StreamingService:
    def __init__(
        self,
        repository: StreamRepository | None = None,
        playback_url_builder: PlaybackUrlBuilder | None = None,
        mediamtx_client: MediaMTXClient | None = None,
    ) -> None:
        self.playback_url_builder = playback_url_builder or PlaybackUrlBuilder.from_env()
        self.repository = repository or build_seed_repository(self.playback_url_builder)
        self.mediamtx_client = mediamtx_client if mediamtx_client is not None else MediaMTXClient.from_env()

    def module_status(self) -> StreamingModuleStatus:
        return StreamingModuleStatus(
            registry_ready=True,
            playback_url_builder_ready=True,
            registered_streams=len(self.list_registered_streams()),
        )

    def list_registered_streams(self) -> list[StreamDescriptor]:
        descriptors = {descriptor.stream_id: descriptor for descriptor in self.repository.list()}
        for path in self._list_mediamtx_paths():
            descriptor = self._descriptor_from_mediamtx_path(path)
            if descriptor is not None:
                descriptors[descriptor.stream_id] = descriptor
        return list(descriptors.values())

    def get_registered_stream(self, stream_id: str) -> StreamDescriptor | None:
        for descriptor in self.list_registered_streams():
            if descriptor.stream_id == stream_id:
                return descriptor
        return None

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

    def _list_mediamtx_paths(self) -> list[MediaMTXPath]:
        if self.mediamtx_client is None:
            return []
        try:
            return self.mediamtx_client.list_paths()
        except MediaMTXClientError:
            return []

    def _descriptor_from_mediamtx_path(self, path: MediaMTXPath) -> StreamDescriptor | None:
        try:
            base_descriptor = StreamDescriptor.from_path(
                path.name,
                status="online" if path.ready else "registered",
                display_name=_display_name_for_mediamtx_path(path),
            )
        except ValueError:
            return None

        return StreamDescriptor(
            stream_path=base_descriptor.stream_path,
            status=base_descriptor.status,
            display_name=base_descriptor.display_name,
            playback_urls=self.playback_url_builder.build(base_descriptor.stream_path),
        )


def _display_name_for_mediamtx_path(path: MediaMTXPath) -> str:
    source = path.source_type or "publisher"
    return f"{path.name} ({source}, readers {path.reader_count})"
