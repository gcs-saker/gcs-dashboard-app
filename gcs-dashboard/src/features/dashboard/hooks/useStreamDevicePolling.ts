import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
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
  fetchDevices?: typeof fetchStreamDeviceOptions;
  onAuthFailure?: () => void;
  preferences: StreamPreferencesSnapshot;
  setSelectedStreamId: Dispatch<SetStateAction<string>>;
  setStreamDevices: Dispatch<SetStateAction<StreamDeviceOption[]>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

interface RefreshStreamDevicesInput extends UseStreamDevicePollingInput {
  isCurrent?: () => boolean;
  stopPolling?: () => void;
}

export function useStreamDevicePolling({
  fetchDevices,
  onAuthFailure,
  preferences,
  setSelectedStreamId,
  setStreamDevices,
  setStreams,
}: UseStreamDevicePollingInput): void {
  const latestInput = useRef({ fetchDevices, onAuthFailure, preferences });
  latestInput.current = { fetchDevices, onAuthFailure, preferences };

  useEffect(() => {
    let isMounted = true;
    let stopped = false;
    let inFlight = false;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const refreshStreams = async (): Promise<void> => {
      if (!isMounted || stopped || inFlight || document.hidden) return;
      inFlight = true;
      const currentInput = latestInput.current;
      try {
        await refreshStreamDevicesOnce({
          fetchDevices: currentInput.fetchDevices,
          onAuthFailure: currentInput.onAuthFailure,
          preferences: currentInput.preferences,
          setSelectedStreamId,
          setStreamDevices,
          setStreams,
          isCurrent: () => isMounted && !stopped,
          stopPolling: () => {
            stopped = true;
          },
        });
      } finally {
        inFlight = false;
      }
      if (isMounted && !stopped) {
        timeoutId = globalThis.setTimeout(() => void refreshStreams(), 3000);
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden || stopped) return;
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      timeoutId = null;
      void refreshStreams();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshStreams();
    return () => {
      isMounted = false;
      if (timeoutId) globalThis.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [setSelectedStreamId, setStreamDevices, setStreams]);
}

export async function refreshStreamDevicesOnce({
  fetchDevices = fetchStreamDeviceOptions,
  isCurrent = () => true,
  onAuthFailure,
  preferences,
  setSelectedStreamId,
  setStreamDevices,
  setStreams,
  stopPolling,
}: RefreshStreamDevicesInput): Promise<void> {
  try {
    const devices = applyStreamDeviceAliases(await fetchDevices(), preferences.deviceAliases);
    if (!isCurrent()) return;
    setStreamDevices((current) => (areStreamDevicesEqual(current, devices) ? current : devices));
    setStreams((current) => {
      const merged = mergeStreamSlotsWithDevices(current, devices);
      setSelectedStreamId((currentSelectedId) => preferredSelectedStreamId(currentSelectedId, merged, devices));
      return areStreamSlotsEqual(current, merged) ? current : merged;
    });
  } catch (error) {
    if (!isCurrent()) return;
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
