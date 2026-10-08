from concurrent.futures import ThreadPoolExecutor

from modules.streaming.mediamtx_client import MediaMTXClient, MediaMTXClientError, MediaMTXPath


def test_snapshot_coalesces_concurrent_reads_and_returns_defensive_lists(monkeypatch) -> None:
    client = MediaMTXClient("http://mediamtx", snapshot_ttl_seconds=60)
    calls = 0

    def load() -> list[MediaMTXPath]:
        nonlocal calls
        calls += 1
        return [MediaMTXPath("raw/local/front", True)]

    monkeypatch.setattr(client, "_load_paths", load)
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: client.list_paths(), range(16)))

    assert calls == 1
    assert all(result == results[0] for result in results)
    assert all(result is not results[0] for result in results[1:])
    client.close()


def test_snapshot_serves_bounded_stale_data_and_supports_invalidation(monkeypatch) -> None:
    client = MediaMTXClient("http://mediamtx", snapshot_ttl_seconds=0, stale_ttl_seconds=60)
    client._snapshot = (0, [MediaMTXPath("raw/local/front", True)])
    monkeypatch.setattr("modules.streaming.mediamtx_client.time.monotonic", lambda: 1)
    monkeypatch.setattr(client, "_load_paths", lambda: (_ for _ in ()).throw(MediaMTXClientError("down")))

    assert client.list_paths()[0].name == "raw/local/front"
    client.invalidate()
    try:
        client.list_paths()
    except MediaMTXClientError:
        pass
    else:
        raise AssertionError("invalidated snapshot survived upstream failure")
    client.close()
