import { useEffect, useMemo, useState } from "react";
import {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  MOCK_STREAM_DEVICES,
  preferredSelectedStreamId,
  type StreamDeviceOption,
} from "../streamDevices";
import { DEFAULT_DASHBOARD_STREAMS } from "../streamTypes";
import { AuthApiError } from "../../auth/authApi";

export function useDashboardStreams(onAuthFailure?: () => void) {
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
    let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;

    const refreshStreams = async (): Promise<void> => {
      try {
        const devices = await fetchStreamDeviceOptions();
        if (!isMounted) return;
        setStreamDevices(devices);
        setStreams((current) => {
          const merged = mergeStreamSlotsWithDevices(current, devices);
          setSelectedStreamId((currentSelectedId) => preferredSelectedStreamId(currentSelectedId, merged, devices));
          return merged;
        });
      } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) {
          if (intervalId) {
            globalThis.clearInterval(intervalId);
          }
          onAuthFailure?.();
          return;
        }
        if (isMounted) {
          setStreams((current) =>
            current.map((stream) => ({ ...stream, status: stream.status === "online" ? "degraded" : stream.status })),
          );
        }
      }
    };

    void refreshStreams();
    intervalId = globalThis.setInterval(() => void refreshStreams(), 3000);

    return () => {
      isMounted = false;
      if (intervalId) {
        globalThis.clearInterval(intervalId);
      }
    };
  }, [onAuthFailure]);

  const openStreamConnection = (streamId: string): void => {
    setSelectedStreamId(streamId);
    setEditingStreamId(streamId);
  };

  const connectStreamDevice = (device: StreamDeviceOption): void => {
    setStreams((current) =>
      current.map((stream) =>
        stream.id === editingStreamId ? connectDeviceToStreamSlot(stream, device) : stream,
      ),
    );
    if (editingStreamId) {
      setSelectedStreamId(editingStreamId);
    }
    setEditingStreamId(null);
  };

  const disconnectCurrentStreamSlot = (): void => {
    setStreams((current) =>
      current.map((stream) => (stream.id === editingStreamId ? disconnectStreamSlot(stream) : stream)),
    );
    setEditingStreamId(null);
  };

  const toggleStreamAiMode = (streamId: string): void => {
    setStreams((current) =>
      current.map((stream) =>
        stream.id === streamId ? { ...stream, aiModeEnabled: !stream.aiModeEnabled } : stream,
      ),
    );
  };

  return {
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
  };
}
