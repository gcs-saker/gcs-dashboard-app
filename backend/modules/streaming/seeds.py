from dataclasses import dataclass

from modules.streaming.domain import StreamDescriptor, StreamStatus
from modules.streaming.playback_url_builder import PlaybackUrlBuilder
from modules.streaming.repository import InMemoryStreamRepository


@dataclass(frozen=True)
class StreamSeed:
    path: str
    status: StreamStatus
    display_name: str

    def to_descriptor(self, playback_url_builder: PlaybackUrlBuilder) -> StreamDescriptor:
        descriptor = StreamDescriptor.from_path(
            self.path,
            status=self.status,
            display_name=self.display_name,
        )
        return StreamDescriptor(
            stream_path=descriptor.stream_path,
            status=descriptor.status,
            display_name=descriptor.display_name,
            playback_urls=playback_url_builder.build(descriptor.stream_path),
        )


DEFAULT_STREAM_SEEDS: tuple[StreamSeed, ...] = (
    StreamSeed(
        path="raw/sample/front",
        status="online",
        display_name="Sample Front Camera",
    ),
    StreamSeed(
        path="raw/sample/thermal",
        status="offline",
        display_name="Sample Thermal Camera",
    ),
    StreamSeed(
        path="raw/sample/rear",
        status="unknown",
        display_name="Sample Rear Camera",
    ),
    StreamSeed(
        path="raw/local/webcam",
        status="registered",
        display_name="Local Webcam Test Harness",
    ),
)


def build_seed_stream_descriptors(
    playback_url_builder: PlaybackUrlBuilder,
    seeds: tuple[StreamSeed, ...] = DEFAULT_STREAM_SEEDS,
) -> list[StreamDescriptor]:
    return [seed.to_descriptor(playback_url_builder) for seed in seeds]


def build_seed_repository(
    playback_url_builder: PlaybackUrlBuilder,
    seeds: tuple[StreamSeed, ...] = DEFAULT_STREAM_SEEDS,
) -> InMemoryStreamRepository:
    return InMemoryStreamRepository(build_seed_stream_descriptors(playback_url_builder, seeds))
