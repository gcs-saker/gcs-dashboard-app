import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectDeviceToStreamSlot,
  createManualStreamDeviceOption,
  disconnectStreamSlot,
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  MOCK_STREAM_DEVICES,
  preferredSelectedStreamId,
  type StreamDeviceOption,
} from "../streamDevices";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  DEFAULT_DASHBOARD_STREAMS,
  type DashboardStreamSlot,
} from "../streamTypes";
import { AuthApiError } from "../../auth/authApi";
import {
  applyStreamDeviceAliases,
  loadStreamPreferences,
  type StreamPreferencesSnapshot,
} from "../streamPreferences";

interface UseDashboardStreamsOptions {
  readonly onAuthFailure?: () => void;
  readonly onStreamDeviceAliasChange?: (deviceId: string, alias: string) => void;
  readonly streamPreferences?: StreamPreferencesSnapshot;
}

export function useDashboardStreams(options: UseDashboardStreamsOptions = {}) {
  const { onAuthFailure, onStreamDeviceAliasChange, streamPreferences } = options;
  const preferences = streamPreferences ?? loadStreamPreferences();
  const [streams, setStreams] = useState(() => DEFAULT_DASHBOARD_STREAMS);
  const [streamDevices, setStreamDevices] = useState<StreamDeviceOption[]>(() =>
    applyStreamDeviceAliases(MOCK_STREAM_DEVICES, preferences.deviceAliases),
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

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;

    const refreshStreams = async (): Promise<void> => {
      try {
        const devices = applyStreamDeviceAliases(await fetchStreamDeviceOptions(), preferences.deviceAliases);
        if (!isMounted) return;
        setStreamDevices((current) => (areStreamDevicesEqual(current, devices) ? current : devices));
        setStreams((current) => {
          const merged = mergeStreamSlotsWithDevices(current, devices);
          setSelectedStreamId((currentSelectedId) => preferredSelectedStreamId(currentSelectedId, merged, devices));
          return areStreamSlotsEqual(current, merged) ? current : merged;
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
  }, [onAuthFailure, preferences.deviceAliases]);

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

  const connectManualStreamAddress = useCallback((address: string, displayName: string): void => {
    if (!editingStreamId) return;
    const editingStreamTitle = streams.find((stream) => stream.id === editingStreamId)?.title ?? "직접 연결";
    const device = createManualStreamDeviceOption(address, displayName, editingStreamTitle);
    onStreamDeviceAliasChange?.(device.id, device.name);
    setStreams((current) =>
      current.map((stream) =>
        stream.id === editingStreamId ? connectDeviceToStreamSlot(stream, device) : stream,
      ),
    );
    setSelectedStreamId(editingStreamId);
    setEditingStreamId(null);
  }, [editingStreamId, onStreamDeviceAliasChange, streams]);

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
    connectManualStreamAddress,
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

function ensureEditableCctvSlot(streams: DashboardStreamSlot[], streamId: string): DashboardStreamSlot[] {
  if (streams.some((stream) => stream.id === streamId)) return streams;
  if (!streamId.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return streams;
  const channelNumber = Number(streamId.replace(CCTV_EMPTY_STREAM_ID_PREFIX, ""));
  if (!Number.isInteger(channelNumber) || channelNumber < 1) return streams;
  return [...streams, createEmptyCctvStreamSlot(channelNumber)];
}

function areStreamDevicesEqual(previous: StreamDeviceOption[], next: StreamDeviceOption[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((device, index) => {
    const nextDevice = next[index];
    return (
      device.id === nextDevice.id &&
      device.name === nextDevice.name &&
      device.mediaType === nextDevice.mediaType &&
      device.status === nextDevice.status &&
      device.streamPath === nextDevice.streamPath &&
      device.sourceUrl === nextDevice.sourceUrl &&
      device.geometry.lat === nextDevice.geometry.lat &&
      device.geometry.lng === nextDevice.geometry.lng &&
      device.geometry.altitudeM === nextDevice.geometry.altitudeM &&
      device.geometry.headingDeg === nextDevice.geometry.headingDeg &&
      device.geometry.pitchDeg === nextDevice.geometry.pitchDeg &&
      device.geometry.rollDeg === nextDevice.geometry.rollDeg &&
      device.geometry.yawDeg === nextDevice.geometry.yawDeg &&
      device.geometry.fovDeg === nextDevice.geometry.fovDeg &&
      device.geometry.source === nextDevice.geometry.source
    );
  });
}

function areStreamSlotsEqual(previous: DashboardStreamSlot[], next: DashboardStreamSlot[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((stream, index) => {
    const nextStream = next[index];
    return (
      stream.id === nextStream.id &&
      stream.title === nextStream.title &&
      stream.status === nextStream.status &&
      stream.mode === nextStream.mode &&
      stream.detail === nextStream.detail &&
      stream.connectedDeviceId === nextStream.connectedDeviceId &&
      stream.streamPath === nextStream.streamPath &&
      stream.sourceUrl === nextStream.sourceUrl &&
      stream.aiModeEnabled === nextStream.aiModeEnabled &&
      stream.geometry?.lat === nextStream.geometry?.lat &&
      stream.geometry?.lng === nextStream.geometry?.lng &&
      stream.geometry?.altitudeM === nextStream.geometry?.altitudeM &&
      stream.geometry?.headingDeg === nextStream.geometry?.headingDeg &&
      stream.geometry?.pitchDeg === nextStream.geometry?.pitchDeg &&
      stream.geometry?.rollDeg === nextStream.geometry?.rollDeg &&
      stream.geometry?.yawDeg === nextStream.geometry?.yawDeg &&
      stream.geometry?.fovDeg === nextStream.geometry?.fovDeg &&
      stream.geometry?.source === nextStream.geometry?.source
    );
  });
}
