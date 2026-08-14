import { backendRootUrl } from "@/config";
import { AUTH_JSON_HEADERS } from "@auth/authApi";
import { fetchValidatedJson } from "@features/apiClient";
import { isGroupMember, isGroupMemberList, type GroupMember, type GroupMemberUpdate } from "./groupMembers";

const groupMemberUrl = (groupId: string, suffix = "members"): string =>
  backendRootUrl(`/auth-policy/api/v1/groups/${encodeURIComponent(groupId)}/${suffix}`);

export function fetchGroupMembers(groupId: string, fetcher: typeof fetch = fetch): Promise<GroupMember[]> {
  return fetchValidatedJson({
    url: groupMemberUrl(groupId), fetcher, isPayload: isGroupMemberList,
    requestDescription: "group member list request", invalidPayloadDescription: "group member list response",
  });
}

export function updateGroupMember(
  groupId: string,
  username: string,
  update: GroupMemberUpdate,
  fetcher: typeof fetch = fetch,
): Promise<GroupMember> {
  return fetchValidatedJson({
    url: groupMemberUrl(groupId, `members/${encodeURIComponent(username)}`), fetcher,
    init: { method: "PATCH", headers: AUTH_JSON_HEADERS, body: JSON.stringify(update) },
    isPayload: isGroupMember, requestDescription: "group member update request",
    invalidPayloadDescription: "group member update response",
  });
}

export function replaceGroupAdministrator(
  groupId: string,
  username: string,
  fetcher: typeof fetch = fetch,
): Promise<GroupMember> {
  return fetchValidatedJson({
    url: groupMemberUrl(groupId, "administrator"), fetcher,
    init: { method: "PUT", headers: AUTH_JSON_HEADERS, body: JSON.stringify({ username }) },
    isPayload: isGroupMember, requestDescription: "group administrator replacement request",
    invalidPayloadDescription: "group administrator replacement response",
  });
}
