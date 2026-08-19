import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { AuthApiError } from "@auth/authApi";
import {
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  type StreamDeviceOption,
} from "@dashboard/assets/streamDevices";
import {
  areStreamDevicesEqual,
  areStreamSlotsEqual,
} from "@dashboard/streaming/dashboardStreamState";
import {
  applyStreamDeviceAliases,
  type StreamPreferencesSnapshot,
} from "@dashboard/preferences/streamPreferences";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { markOnlineStreamsDegraded, shouldSkipStreamRefresh } from "./streamPollingPolicy";
export { markOnlineStreamsDegraded } from "./streamPollingPolicy";

interface UseStreamDevicePollingInput {
  fetchDevices?: typeof fetchStreamDeviceOptions;
  onAuthFailure?: () => void;
  preferences: StreamPreferencesSnapshot;
  setStreamDevices: Dispatch<SetStateAction<StreamDeviceOption[]>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

interface RefreshStreamDevicesInput extends UseStreamDevicePollingInput {
  isCurrent?: () => boolean;
  stopPolling?: () => void;
}

const STREAM_POLL_INTERVAL_MS = 3_000;
const STREAM_POLL_MAX_BACKOFF_MS = 60_000;

export function useStreamDevicePolling({
  fetchDevices,
  onAuthFailure,
  preferences,
  setStreamDevices,
  setStreams,
}: UseStreamDevicePollingInput): void {
  const latestInput = useRef({ fetchDevices, onAuthFailure, preferences });
  latestInput.current = { fetchDevices, onAuthFailure, preferences };
  useEffect(
    () => startPollingLoop(latestInput, { setStreamDevices, setStreams }),
    [setStreamDevices, setStreams],
  );
}

type PollingSnapshot = Pick<UseStreamDevicePollingInput, "fetchDevices" | "onAuthFailure" | "preferences">;
type PollingSetters = Pick<UseStreamDevicePollingInput, "setStreamDevices" | "setStreams">;

function startPollingLoop(latestInput: MutableRefObject<PollingSnapshot>, setters: PollingSetters): () => void {
    let isMounted = true;
    let stopped = false;
    let inFlight = false;
    let consecutiveFailures = 0;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const refreshStreams = async (): Promise<void> => {
      if (shouldSkipStreamRefresh(isMounted, stopped, inFlight, document.hidden)) return;
      inFlight = true;
      const currentInput = latestInput.current;
      try {
        const succeeded = await refreshStreamDevicesOnce({
          fetchDevices: currentInput.fetchDevices,
          onAuthFailure: currentInput.onAuthFailure,
          preferences: currentInput.preferences,
          ...setters,
          isCurrent: () => isMounted && !stopped,
          stopPolling: () => {
            stopped = true;
          },
        });
        consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
      } finally {
        inFlight = false;
      }
      if (isMounted && !stopped) {
        const retryDelayMs = Math.min(
          STREAM_POLL_INTERVAL_MS * 2 ** consecutiveFailures,
          STREAM_POLL_MAX_BACKOFF_MS,
        );
        timeoutId = globalThis.setTimeout(() => void refreshStreams(), retryDelayMs);
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
}

export async function refreshStreamDevicesOnce({
  fetchDevices = fetchStreamDeviceOptions,
  isCurrent = () => true,
  onAuthFailure,
  preferences,
  setStreamDevices,
  setStreams,
  stopPolling,
}: RefreshStreamDevicesInput): Promise<boolean> {
  try {
    const devices = applyStreamDeviceAliases(await fetchDevices(), preferences.deviceAliases);
    if (!isCurrent()) return false;
    setStreamDevices((current) => (areStreamDevicesEqual(current, devices) ? current : devices));
    setStreams((current) => {
      const merged = mergeStreamSlotsWithDevices(current, devices);
      return areStreamSlotsEqual(current, merged) ? current : merged;
    });
  } catch (error) {
    if (!isCurrent()) return false;
    if (error instanceof AuthApiError && error.status === 401) {
      stopPolling?.();
      onAuthFailure?.();
      return false;
    }
    setStreams(markOnlineStreamsDegraded);
    return false;
  }
  return true;
}
