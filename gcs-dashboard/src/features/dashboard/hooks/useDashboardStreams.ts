import { useCallback, useMemo, useState } from "react";
import {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  MOCK_STREAM_DEVICES,
  type StreamDeviceOption,
} from "@dashboard/streamDevices";
import {
  DEFAULT_DASHBOARD_STREAMS,
  type DashboardStreamSlot,
} from "@dashboard/streamTypes";
import {
  applyStreamDeviceAliases,
  EMPTY_STREAM_PREFERENCES,
  type StreamPreferencesSnapshot,
} from "@dashboard/streamPreferences";
import {
  ensureEditableCctvSlot,
} from "@dashboard/dashboardStreamState";
import { useStreamDevicePolling } from "./useStreamDevicePolling";

interface UseDashboardStreamsOptions {
  readonly onAuthFailure?: () => void;
  readonly onStreamDeviceAliasChange?: (deviceId: string, alias: string) => void;
  readonly streamPreferences?: StreamPreferencesSnapshot;
}

export function useDashboardStreams(options: UseDashboardStreamsOptions = {}) {
  const { onAuthFailure, onStreamDeviceAliasChange, streamPreferences } = options;
  const preferences = streamPreferences ?? EMPTY_STREAM_PREFERENCES;
  const [streams, setStreams] = useState(() => DEFAULT_DASHBOARD_STREAMS);
  const [streamDevices, setStreamDevices] = useState<StreamDeviceOption[]>(() =>
    import.meta.env.MODE === "test"
      ? applyStreamDeviceAliases(MOCK_STREAM_DEVICES, preferences.deviceAliases)
      : [],
  );
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

  useStreamDevicePolling({ onAuthFailure, preferences, setSelectedStreamId, setStreamDevices, setStreams });

  const openStreamConnection = useCallback((streamId: string): void => {
    setStreams((current) => ensureEditableCctvSlot(current, streamId));
    setSelectedStreamId(streamId);
    setEditingStreamId(streamId);
  }, []);

  const selectStream = useCallback((streamIdentifier: string): void => {
    setStreams((current) => {
      const nextStreams = ensureEditableCctvSlot(current, streamIdentifier);
      const matchingStream = nextStreams.find((stream) => stream.id === streamIdentifier || stream.streamPath === streamIdentifier);
      if (matchingStream) {
        setSelectedStreamId(matchingStream.id);
      }
      return nextStreams;
    });
  }, []);

  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    onStreamDeviceAliasChange?.(device.id, device.name);
    setStreams((current) =>
      current.map((stream) =>
        stream.id === editingStreamId ? connectDeviceToStreamSlot(stream, device) : stream,
      ),
    );
    if (editingStreamId) {
      setSelectedStreamId(editingStreamId);
    }
    setEditingStreamId(null);
  }, [editingStreamId, onStreamDeviceAliasChange]);

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

  return {
    connectStreamDevice,
    disconnectCurrentStreamSlot,
    editingStream,
    openStreamConnection,
    selectStream,
    selectedStream,
    selectedStreamId,
    setEditingStreamId,
    streamDevices,
    streams,
    toggleStreamAiMode,
  };
}
