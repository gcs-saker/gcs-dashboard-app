import { backendRootUrl } from "@/config";
import { BACKEND_ROOT_ROUTES } from "@/features/apiRoutes";
import { fetchValidatedJson } from "@/features/apiClient";
import { AUTH_JSON_HEADERS } from "@/features/auth/authApi";
import {
  isSignupTokenIssue,
  isSignupTokenRecordList,
  type IssueSignupTokenInput,
  type SignupTokenIssue,
  type SignupTokenRecord,
} from "@dashboard/devices/signupTokens";

export function fetchSignupTokens(fetcher: typeof fetch = fetch): Promise<SignupTokenRecord[]> {
  return fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.signupTokens),
    fetcher,
    isPayload: isSignupTokenRecordList,
    requestDescription: "signup token list request",
    invalidPayloadDescription: "signup token list payload",
  });
}

export function issueSignupToken(
  input: IssueSignupTokenInput,
  fetcher: typeof fetch = fetch,
): Promise<SignupTokenIssue> {
  return fetchValidatedJson({
    url: backendRootUrl(BACKEND_ROOT_ROUTES.signupTokens),
    fetcher,
    init: { method: "POST", headers: AUTH_JSON_HEADERS, body: JSON.stringify(input) },
    isPayload: isSignupTokenIssue,
    requestDescription: "signup token issue request",
    invalidPayloadDescription: "signup token issue payload",
  });
}
