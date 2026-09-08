import { backendRootUrl } from "@/config";
import { BACKEND_ROOT_ROUTES } from "@/features/apiRoutes";
import { fetchValidatedJson } from "@/features/apiClient";
import { AUTH_JSON_HEADERS } from "@/features/auth/authApi";
import {
  isProvisioningTokenIssue,
  isProvisioningTokenRecordList,
  type IssueProvisioningTokenInput,
  type ProvisioningTokenIssue,
  type ProvisioningTokenRecord,
} from "@dashboard/devices/deviceProvisioningTokens";

export async function fetchProvisioningTokens(fetcher: typeof fetch = fetch): Promise<ProvisioningTokenRecord[]> {
  return fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.provisioningTokens),
    fetcher,
    isPayload: isProvisioningTokenRecordList,
    requestDescription: "provisioning token list request",
    invalidPayloadDescription: "provisioning token list payload",
  });
}

export async function issueProvisioningToken(
  input: IssueProvisioningTokenInput,
  fetcher: typeof fetch = fetch,
): Promise<ProvisioningTokenIssue> {
  return fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.provisioningTokens),
    fetcher,
    init: {
      method: "POST",
      headers: AUTH_JSON_HEADERS,
      body: JSON.stringify(input),
    },
    isPayload: isProvisioningTokenIssue,
    requestDescription: "provisioning token issue request",
    invalidPayloadDescription: "provisioning token issue payload",
  });
}
