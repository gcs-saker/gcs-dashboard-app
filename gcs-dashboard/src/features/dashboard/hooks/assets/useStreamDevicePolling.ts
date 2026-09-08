import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { fetchStreamDeviceOptions, type StreamDeviceOption } from "@dashboard/assets/streamDevices";
import type { StreamPreferencesSnapshot } from "@dashboard/preferences/streamPreferences";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { startStreamDevicePolling } from "./streamDevicePollingRuntime";

interface UseStreamDevicePollingInput {
  fetchDevices?: typeof fetchStreamDeviceOptions;
  onAuthFailure?: () => void;
  preferences: StreamPreferencesSnapshot;
  setStreamDevices: Dispatch<SetStateAction<StreamDeviceOption[]>>;
  setStreams: Dispatch<SetStateAction<DashboardStreamSlot[]>>;
}

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
    () => startStreamDevicePolling(latestInput, { setStreamDevices, setStreams }),
    [setStreamDevices, setStreams],
  );
}

export { markOnlineStreamsDegraded } from "./streamPollingPolicy";
export { refreshStreamDevicesOnce } from "./streamDevicePollingRuntime";
