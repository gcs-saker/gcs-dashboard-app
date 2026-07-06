import { useEffect, type Dispatch, type SetStateAction } from "react";
import { AuthApiError } from "@auth/authApi";
import {
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  preferredSelectedStreamId,
  type StreamDeviceOption,
} from "@dashboard/streamDevices";
import {
  areStreamDevicesEqual,
  areStreamSlotsEqual,
} from "@dashboard/dashboardStreamState";
import {
  applyStreamDeviceAliases,
  type StreamPreferencesSnapshot,
} from "@dashboard/streamPreferences";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";

interface UseStreamDevicePollingInput {
  onAuthFailure?: () => void;
  preferences: StreamPreferencesSnapshot;
  setSelectedStreamId: Dispatch<SetStateAction<string>>;
  setStreamDevices: Dispatch<SetStateAction<StreamDeviceOption[]>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

interface RefreshStreamDevicesInput extends UseStreamDevicePollingInput {
  fetchDevices?: typeof fetchStreamDeviceOptions;
  stopPolling?: () => void;
}

export function useStreamDevicePolling({
  onAuthFailure,
  preferences,
  setSelectedStreamId,
  setStreamDevices,
  setStreams,
}: UseStreamDevicePollingInput): void {
  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;
    const refreshStreams = async (): Promise<void> => {
      if (!isMounted) return;
      await refreshStreamDevicesOnce({
        onAuthFailure,
        preferences,
        setSelectedStreamId,
        setStreamDevices,
        setStreams,
        stopPolling: () => {
          if (intervalId) globalThis.clearInterval(intervalId);
        },
      });
    };

    void refreshStreams();
    intervalId = globalThis.setInterval(() => void refreshStreams(), 3000);
    return () => {
      isMounted = false;
      if (intervalId) globalThis.clearInterval(intervalId);
    };
  }, [onAuthFailure, preferences.deviceAliases, setSelectedStreamId, setStreamDevices, setStreams]);
}

export async function refreshStreamDevicesOnce({
  fetchDevices = fetchStreamDeviceOptions,
  onAuthFailure,
  preferences,
  setSelectedStreamId,
  setStreamDevices,
  setStreams,
  stopPolling,
}: RefreshStreamDevicesInput): Promise<void> {
  try {
    const devices = applyStreamDeviceAliases(await fetchDevices(), preferences.deviceAliases);
    setStreamDevices((current) => (areStreamDevicesEqual(current, devices) ? current : devices));
    setStreams((current) => {
      const merged = mergeStreamSlotsWithDevices(current, devices);
      setSelectedStreamId((currentSelectedId) => preferredSelectedStreamId(currentSelectedId, merged, devices));
      return areStreamSlotsEqual(current, merged) ? current : merged;
    });
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      stopPolling?.();
      onAuthFailure?.();
      return;
    }
    setStreams(markOnlineStreamsDegraded);
  }
}

export function markOnlineStreamsDegraded(streams: DashboardStreamSlot[]): DashboardStreamSlot[] {
  let hasChanged = false;
  const nextStreams = streams.map((stream) => {
    if (stream.status !== "online") return stream;
    hasChanged = true;
    return { ...stream, status: "degraded" as const };
  });
  return hasChanged ? nextStreams : streams;
}
