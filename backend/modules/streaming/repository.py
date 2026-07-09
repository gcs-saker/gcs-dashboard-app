from typing import Iterable, Protocol

from modules.streaming.domain import StreamDescriptor


class StreamRepository(Protocol):
    def list(self) -> list[StreamDescriptor]: ...

    def get(self, stream_id: str) -> StreamDescriptor | None: ...

    def upsert(self, descriptor: StreamDescriptor) -> StreamDescriptor: ...


class InMemoryStreamRepository:
    def __init__(self, streams: Iterable[StreamDescriptor] | None = None) -> None:
        self._streams: dict[str, StreamDescriptor] = {}
        for stream in streams or []:
            self.upsert(stream)

    def list(self) -> list[StreamDescriptor]:
        return list(self._streams.values())

    def get(self, stream_id: str) -> StreamDescriptor | None:
        return self._streams.get(stream_id)

    def upsert(self, descriptor: StreamDescriptor) -> StreamDescriptor:
        self._streams[descriptor.stream_id] = descriptor
        return descriptor
