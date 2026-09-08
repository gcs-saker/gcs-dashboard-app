import { backendRootUrl } from "@/config";
import { AUTH_JSON_HEADERS } from "@auth/authApi";
import { fetchValidatedJson } from "@features/apiClient";
import { isManagedGroup, isManagedGroupList, type ManagedGroup } from "@dashboard/groups/managedGroups";

const root = "/auth-policy/admin/groups";

export function fetchManagedGroups(fetcher: typeof fetch = fetch): Promise<ManagedGroup[]> {
  return fetchValidatedJson({ url: backendRootUrl(root), fetcher, isPayload: isManagedGroupList,
    requestDescription: "managed group list request", invalidPayloadDescription: "managed group list response" });
}

export function createManagedGroup(input: Omit<ManagedGroup, "status">, fetcher: typeof fetch = fetch): Promise<ManagedGroup> {
  return requestGroup("", "POST", input, fetcher);
}

export function updateManagedGroup(groupId: string, input: { name?: string; parentId?: string | null; changeParent?: boolean }, fetcher: typeof fetch = fetch): Promise<ManagedGroup> {
  return requestGroup(`/${encodeURIComponent(groupId)}`, "PATCH", input, fetcher);
}

export function changeManagedGroupStatus(groupId: string, active: boolean, fetcher: typeof fetch = fetch): Promise<ManagedGroup> {
  return requestGroup(`/${encodeURIComponent(groupId)}/${active ? "activate" : "deactivate"}`, "POST", undefined, fetcher);
}

function requestGroup(path: string, method: string, body: unknown, fetcher: typeof fetch): Promise<ManagedGroup> {
  return fetchValidatedJson({
    url: backendRootUrl(`${root}${path}`), fetcher,
    init: { method, headers: AUTH_JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) },
    isPayload: isManagedGroup, requestDescription: "managed group mutation request",
    invalidPayloadDescription: "managed group mutation response",
  });
}
