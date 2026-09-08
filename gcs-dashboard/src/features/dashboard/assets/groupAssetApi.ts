import { backendRootUrl } from "@/config";
import { BACKEND_ROOT_ROUTES } from "@features/apiRoutes";
import { fetchValidatedJson } from "@features/apiClient";
import {
  isAccessibleGroupDeviceList,
  isAccessibleGroupList,
  type AccessibleGroupInventory,
} from "@dashboard/assets/groupAssetContracts";

export async function fetchAccessibleGroupInventory(fetcher: typeof fetch = fetch): Promise<AccessibleGroupInventory> {
  const groups = await fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.groups), fetcher,
    isPayload: isAccessibleGroupList,
    requestDescription: "accessible groups request",
    invalidPayloadDescription: "accessible groups response",
  });
  const devicesByGroup = await Promise.all(groups.map((group) => fetchValidatedJson({
    url: backendRootUrl(`${BACKEND_ROOT_ROUTES.groups}/${encodeURIComponent(group.id)}/devices`), fetcher,
    isPayload: isAccessibleGroupDeviceList,
    requestDescription: "group devices request",
    invalidPayloadDescription: "group devices response",
  })));
  return { groups, devices: devicesByGroup.flat() };
}
