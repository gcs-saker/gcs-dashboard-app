from time import monotonic

from modules.streaming.domain import PlaybackUrls, StreamDescriptor, StreamingModuleStatus, StreamStatus
from modules.streaming.mediamtx_client import MediaMTXClient, MediaMTXClientError, MediaMTXPath
from modules.streaming.playback_url_builder import PlaybackUrlBuilder
from modules.streaming.repository import StreamRepository
from modules.streaming.seeds import build_seed_repository


DEFAULT_RUNTIME_CACHE_TTL_SECONDS = 0.5


class StreamingService:
    def __init__(
        self,
        repository: StreamRepository | None = None,
        playback_url_builder: PlaybackUrlBuilder | None = None,
        mediamtx_client: MediaMTXClient | None = None,
        runtime_cache_ttl_seconds: float = DEFAULT_RUNTIME_CACHE_TTL_SECONDS,
    ) -> None:
        self.playback_url_builder = playback_url_builder or PlaybackUrlBuilder.from_env()
        self.repository = repository or build_seed_repository(self.playback_url_builder)
        self.mediamtx_client = mediamtx_client if mediamtx_client is not None else MediaMTXClient.from_env()
        self.runtime_cache_ttl_seconds = max(0.0, runtime_cache_ttl_seconds)
        self._runtime_descriptors_cache: dict[str, StreamDescriptor] | None = None
        self._runtime_cache_expires_at = 0.0

    def module_status(self) -> StreamingModuleStatus:
        descriptors = self._merged_stream_descriptors()
        return StreamingModuleStatus(
            registry_ready=True,
            playback_url_builder_ready=True,
            registered_streams=len(descriptors),
        )

    def list_registered_streams(self) -> list[StreamDescriptor]:
        return list(self._merged_stream_descriptors().values())

    def get_registered_stream(self, stream_id: str) -> StreamDescriptor | None:
        return self._merged_stream_descriptors().get(stream_id)

    def _merged_stream_descriptors(self) -> dict[str, StreamDescriptor]:
        descriptors = {descriptor.stream_id: descriptor for descriptor in self.repository.list()}
        descriptors.update(self._runtime_stream_descriptors())
        return descriptors

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

    def _runtime_stream_descriptors(self) -> dict[str, StreamDescriptor]:
        now = monotonic()
        if self._runtime_descriptors_cache is not None and now < self._runtime_cache_expires_at:
            return self._runtime_descriptors_cache

        descriptors: dict[str, StreamDescriptor] = {}
        for path in self._list_mediamtx_paths():
            descriptor = self._descriptor_from_mediamtx_path(path)
            if descriptor is not None:
                descriptors[descriptor.stream_id] = descriptor

        self._runtime_descriptors_cache = descriptors
        self._runtime_cache_expires_at = now + self.runtime_cache_ttl_seconds
        return descriptors

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
