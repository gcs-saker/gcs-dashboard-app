import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  MOCK_STREAM_DEVICES,
  type StreamDeviceOption,
} from "../streamDevices";
import { DEFAULT_DASHBOARD_STREAMS } from "../streamTypes";

export function useDashboardStreams() {
  const [streams, setStreams] = useState(() => DEFAULT_DASHBOARD_STREAMS);
  const [streamDevices, setStreamDevices] = useState<StreamDeviceOption[]>(MOCK_STREAM_DEVICES);
  const [selectedStreamId, setSelectedStreamId] = useState(DEFAULT_DASHBOARD_STREAMS[0].id);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);

  const selectedStream = useMemo(
    () => streams.find((stream) => stream.id === selectedStreamId) ?? streams[0],
    [selectedStreamId, streams],
  );
  const editingStream = useMemo(
    () => streams.find((stream) => stream.id === editingStreamId) ?? null,
    [editingStreamId, streams],
  );

  useEffect(() => {
    let isMounted = true;

    const refreshStreams = async (): Promise<void> => {
      try {
        const devices = await fetchStreamDeviceOptions();
        if (!isMounted || devices.length === 0) return;
        setStreamDevices(devices);
        setStreams((current) => mergeStreamSlotsWithDevices(current, devices));
      } catch {
        if (isMounted) {
          setStreams((current) =>
            current.map((stream) => ({ ...stream, status: stream.status === "online" ? "degraded" : stream.status })),
          );
        }
      }
    };

    void refreshStreams();
    const intervalId = globalThis.setInterval(() => void refreshStreams(), 3000);

    return () => {
      isMounted = false;
      globalThis.clearInterval(intervalId);
    };
  }, []);

  const openStreamConnection = useCallback((streamId: string): void => {
    setSelectedStreamId(streamId);
    setEditingStreamId(streamId);
  }, []);

  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    setStreams((current) =>
      current.map((stream) =>
        stream.id === editingStreamId ? connectDeviceToStreamSlot(stream, device) : stream,
      ),
    );
    if (editingStreamId) {
      setSelectedStreamId(editingStreamId);
    }
    setEditingStreamId(null);
  }, [editingStreamId]);

  const disconnectCurrentStreamSlot = useCallback((): void => {
    setStreams((current) =>
      current.map((stream) => (stream.id === editingStreamId ? disconnectStreamSlot(stream) : stream)),
    );
    setEditingStreamId(null);
  }, [editingStreamId]);

  const toggleStreamAiMode = useCallback((streamId: string): void => {
    setStreams((current) =>
      current.map((stream) =>
        stream.id === streamId ? { ...stream, aiModeEnabled: !stream.aiModeEnabled } : stream,
      ),
    );
  }, []);

  return useMemo(() => ({
    connectStreamDevice,
    disconnectCurrentStreamSlot,
    editingStream,
    openStreamConnection,
    selectedStream,
    selectedStreamId,
    setEditingStreamId,
    streamDevices,
    streams,
    toggleStreamAiMode,
  }), [
    connectStreamDevice,
    disconnectCurrentStreamSlot,
    editingStream,
    openStreamConnection,
    selectedStream,
    selectedStreamId,
    streamDevices,
    streams,
    toggleStreamAiMode,
  ]);
}
