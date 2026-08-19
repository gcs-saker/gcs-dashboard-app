import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  MOCK_STREAM_DEVICES,
  type StreamDeviceOption,
} from "@dashboard/assets/streamDevices";
import {
  DEFAULT_DASHBOARD_STREAMS,
  type DashboardStreamSlot,
} from "@dashboard/streaming/streamTypes";
import {
  applyStreamDeviceAliases,
  EMPTY_STREAM_PREFERENCES,
  type StreamPreferencesSnapshot,
} from "@dashboard/preferences/streamPreferences";
import {
  ensureEditableCctvSlot,
} from "@dashboard/streaming/dashboardStreamState";
import { useStreamDevicePolling } from "@dashboard/hooks/assets/useStreamDevicePolling";

interface UseDashboardStreamsOptions {
  readonly initialStreams?: DashboardStreamSlot[];
  readonly onAuthFailure?: () => void;
  readonly onStreamDeviceAliasChange?: (deviceId: string, alias: string) => void;
  readonly streamPreferences?: StreamPreferencesSnapshot;
}

export function useDashboardStreams(options: UseDashboardStreamsOptions = {}) {
  const { initialStreams, onAuthFailure, onStreamDeviceAliasChange, streamPreferences } = options;
  const preferences = streamPreferences ?? EMPTY_STREAM_PREFERENCES;
  const [streams, setStreams] = useState(() => initialStreams ?? DEFAULT_DASHBOARD_STREAMS);
  const [streamDevices, setStreamDevices] = useState<StreamDeviceOption[]>(() =>
    import.meta.env.MODE === "test"
      ? applyStreamDeviceAliases(MOCK_STREAM_DEVICES, preferences.deviceAliases)
      : [],
  );
  const [selectedStreamId, setSelectedStreamId] = useState(initialStreams?.[0]?.id ?? DEFAULT_DASHBOARD_STREAMS[0].id);
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
  const actions = useDashboardStreamActions({ editingStreamId, onStreamDeviceAliasChange,
    setEditingStreamId, setSelectedStreamId, setStreams });

  return {
    ...actions,
    editingStream,
    selectedStream,
    selectedStreamId,
    setEditingStreamId,
    streamDevices,
    streams,
  };
}

interface StreamActionsInput {
  editingStreamId: string | null;
  onStreamDeviceAliasChange?: (deviceId: string, alias: string) => void;
  setEditingStreamId: Dispatch<SetStateAction<string | null>>;
  setSelectedStreamId: Dispatch<SetStateAction<string>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

function useDashboardStreamActions(input: StreamActionsInput) {
  const openStreamConnection = useCallback((streamId: string): void => {
    input.setStreams((current) => ensureEditableCctvSlot(current, streamId));
    input.setSelectedStreamId(streamId); input.setEditingStreamId(streamId);
  }, [input]);
  const selectStream = useCallback((identifier: string): void => input.setStreams((current) => {
    const next = ensureEditableCctvSlot(current, identifier);
    const match = next.find((stream) => stream.id === identifier || stream.streamPath === identifier);
    if (match) input.setSelectedStreamId(match.id);
    return next;
  }), [input]);
  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    input.onStreamDeviceAliasChange?.(device.id, device.name);
    input.setStreams((current) => current.map((stream) => input.editingStreamId === stream.id
      ? connectDeviceToStreamSlot(stream, device) : stream));
    if (input.editingStreamId) input.setSelectedStreamId(input.editingStreamId);
    input.setEditingStreamId(null);
  }, [input]);
  const disconnectCurrentStreamSlot = useCallback((): void => {
    input.setStreams((current) => current.map((stream) => input.editingStreamId === stream.id
      ? disconnectStreamSlot(stream) : stream));
    input.setEditingStreamId(null);
  }, [input]);
  const toggleStreamAiMode = useCallback((streamId: string): void => input.setStreams((current) =>
    current.map((stream) => stream.id === streamId ? { ...stream, aiModeEnabled: !stream.aiModeEnabled } : stream)), [input]);
  return { connectStreamDevice, disconnectCurrentStreamSlot, openStreamConnection, selectStream, toggleStreamAiMode };
}
