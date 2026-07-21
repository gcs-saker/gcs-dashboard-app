import { backendRootUrl } from "@/config";
import { BACKEND_ROOT_ROUTES } from "@/features/apiRoutes";
import { fetchValidatedJson } from "@/features/apiClient";
import { AUTH_ACCEPT_HEADERS } from "@/features/auth/authApi";
import {
  isRegisteredDevice,
  isRegisteredDeviceList,
  type RegisteredDevice,
} from "./adminDevices";

export async function fetchRegisteredDevices(fetcher: typeof fetch = fetch): Promise<RegisteredDevice[]> {
  return fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.adminDevices),
    fetcher,
    isPayload: isRegisteredDeviceList,
    requestDescription: "registered device list request",
    invalidPayloadDescription: "registered device list payload",
  });
}

export async function activateRegisteredDevice(
  deviceUuid: string,
  fetcher: typeof fetch = fetch,
): Promise<RegisteredDevice> {
  return mutateRegisteredDevice(`${deviceRoute(deviceUuid)}/activate`, "registered device activate request", fetcher);
}

export async function disableRegisteredDevice(
  deviceUuid: string,
  fetcher: typeof fetch = fetch,
): Promise<RegisteredDevice> {
  return mutateRegisteredDevice(`${deviceRoute(deviceUuid)}/disable`, "registered device disable request", fetcher);
}

async function mutateRegisteredDevice(
  route: string,
  requestDescription: string,
  fetcher: typeof fetch,
): Promise<RegisteredDevice> {
  return fetchValidatedJson({
    url: backendRootUrl(route),
    fetcher,
    init: { method: "POST", headers: AUTH_ACCEPT_HEADERS },
    isPayload: isRegisteredDevice,
    requestDescription,
    invalidPayloadDescription: "registered device mutation payload",
  });
}

function deviceRoute(deviceUuid: string): string {
  return `${BACKEND_ROOT_ROUTES.adminDevices}/${encodeURIComponent(deviceUuid)}`;
}
