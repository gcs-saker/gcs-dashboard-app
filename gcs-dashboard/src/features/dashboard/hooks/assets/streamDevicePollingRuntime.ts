import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { AuthApiError } from "@auth/authApi";
import {
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  type StreamDeviceOption,
} from "@dashboard/assets/streamDevices";
import { applyStreamDeviceAliases, type StreamPreferencesSnapshot } from "@dashboard/preferences/streamPreferences";
import { areStreamDevicesEqual, areStreamSlotsEqual } from "@dashboard/streaming/dashboardStreamState";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { markOnlineStreamsDegraded, shouldSkipStreamRefresh } from "./streamPollingPolicy";

interface PollingSnapshot {
  fetchDevices?: typeof fetchStreamDeviceOptions;
  onAuthFailure?: () => void;
  preferences: StreamPreferencesSnapshot;
}

interface PollingSetters {
  setStreamDevices: Dispatch<SetStateAction<StreamDeviceOption[]>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

interface RefreshStreamDevicesInput extends PollingSnapshot, PollingSetters {
  isCurrent?: () => boolean;
  stopPolling?: () => void;
}

const STREAM_POLL_INTERVAL_MS = 3_000;
const STREAM_POLL_MAX_BACKOFF_MS = 60_000;

export function startStreamDevicePolling(
  latestInput: MutableRefObject<PollingSnapshot>,
  setters: PollingSetters,
): () => void {
  let active = true;
  let stopped = false;
  let inFlight = false;
  let consecutiveFailures = 0;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  const refreshStreams = async (): Promise<void> => {
    if (shouldSkipStreamRefresh(active, stopped, inFlight, document.hidden)) return;
    inFlight = true;
    try {
      const succeeded = await refreshStreamDevicesOnce({
        ...latestInput.current, ...setters, isCurrent: () => active && !stopped,
        stopPolling: () => { stopped = true; },
      });
      consecutiveFailures = succeeded ? 0 : consecutiveFailures + 1;
    } finally {
      inFlight = false;
    }
    if (active && !stopped) {
      const delay = Math.min(STREAM_POLL_INTERVAL_MS * 2 ** consecutiveFailures, STREAM_POLL_MAX_BACKOFF_MS);
      timeoutId = globalThis.setTimeout(() => void refreshStreams(), delay);
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
    active = false;
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

export async function refreshStreamDevicesOnce({
  fetchDevices = fetchStreamDeviceOptions, isCurrent = () => true, onAuthFailure, preferences,
  setStreamDevices, setStreams, stopPolling,
}: RefreshStreamDevicesInput): Promise<boolean> {
  try {
    const devices = applyStreamDeviceAliases(await fetchDevices(), preferences.deviceAliases);
    if (!isCurrent()) return false;
    setStreamDevices((current) => (areStreamDevicesEqual(current, devices) ? current : devices));
    setStreams((current) => {
      const merged = mergeStreamSlotsWithDevices(current, devices);
      return areStreamSlotsEqual(current, merged) ? current : merged;
    });
    return true;
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
}
