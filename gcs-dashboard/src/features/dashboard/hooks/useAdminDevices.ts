import { useCallback, useEffect, useReducer } from "react";
import {
  activateRegisteredDevice,
  disableRegisteredDevice,
  fetchRegisteredDevices,
} from "@dashboard/adminDeviceApi";
import {
  pendingRegisteredDevices,
  type RegisteredDevice,
} from "@dashboard/adminDevices";

interface AdminDeviceState {
  devices: RegisteredDevice[];
  errorMessage: string | null;
  isLoading: boolean;
  mutatingDeviceUuid: string | null;
}

type AdminDeviceAction =
  | { type: "loading" }
  | { type: "loaded"; devices: RegisteredDevice[] }
  | { type: "failed"; message: string }
  | { type: "mutating"; deviceUuid: string }
  | { type: "mutated"; device: RegisteredDevice }
  | { type: "mutationFailed"; message: string };

const initialState: AdminDeviceState = {
  devices: [],
  errorMessage: null,
  isLoading: true,
  mutatingDeviceUuid: null,
};

export function useAdminDevices(fetcher: typeof fetch = fetch) {
  const [state, dispatch] = useReducer(adminDeviceReducer, initialState);

  const refresh = useCallback(async (): Promise<void> => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", devices: await fetchRegisteredDevices(fetcher) });
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error, "등록 장비 목록 조회 실패") });
    }
  }, [fetcher]);

  const activate = useCallback(async (deviceUuid: string): Promise<void> => {
    await mutateDevice(deviceUuid, activateRegisteredDevice, fetcher, dispatch);
  }, [fetcher]);

  const disable = useCallback(async (deviceUuid: string): Promise<void> => {
    await mutateDevice(deviceUuid, disableRegisteredDevice, fetcher, dispatch);
  }, [fetcher]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    activate,
    disable,
    pendingDevices: pendingRegisteredDevices(state.devices),
    refresh,
  };
}

function adminDeviceReducer(state: AdminDeviceState, action: AdminDeviceAction): AdminDeviceState {
  switch (action.type) {
    case "loading":
      return { ...state, errorMessage: null, isLoading: true };
    case "loaded":
      return { ...state, devices: action.devices, errorMessage: null, isLoading: false };
    case "failed":
      return { ...state, errorMessage: action.message, isLoading: false };
    case "mutating":
      return { ...state, errorMessage: null, mutatingDeviceUuid: action.deviceUuid };
    case "mutated":
      return {
        ...state,
        devices: upsertDevice(state.devices, action.device),
        errorMessage: null,
        mutatingDeviceUuid: null,
      };
    case "mutationFailed":
      return { ...state, errorMessage: action.message, mutatingDeviceUuid: null };
    default:
      return state;
  }
}

async function mutateDevice(
  deviceUuid: string,
  mutation: (deviceUuid: string, fetcher?: typeof fetch) => Promise<RegisteredDevice>,
  fetcher: typeof fetch,
  dispatch: (action: AdminDeviceAction) => void,
): Promise<void> {
  dispatch({ type: "mutating", deviceUuid });
  try {
    dispatch({ type: "mutated", device: await mutation(deviceUuid, fetcher) });
  } catch (error) {
    dispatch({ type: "mutationFailed", message: errorMessage(error, "등록 장비 상태 변경 실패") });
  }
}

function upsertDevice(devices: readonly RegisteredDevice[], updated: RegisteredDevice): RegisteredDevice[] {
  return devices.map((device) => device.deviceUuid === updated.deviceUuid ? updated : device);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
