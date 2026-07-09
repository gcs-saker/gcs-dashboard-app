import { authUrl } from "@/config";
import { AUTH_ROUTES } from "@/features/apiRoutes";
import { clearAuthSession, storeAuthSession } from "./authStorage";
import { AuthApiError, parseAuthError } from "./authErrors";
import {
  AUTH_ACCEPT_HEADERS,
  AUTH_CSRF_HEADERS,
  AUTH_JSON_HEADERS,
  buildAuthHeaders,
  withAuth,
} from "./authHeaders";
import type { AuthenticatedUser, LoginRequest, SignupRequest, SignupResponse, TokenResponse } from "./types";

export {
  AUTH_ACCEPT_HEADERS,
  AUTH_CSRF_HEADERS,
  AUTH_JSON_HEADERS,
  buildAuthHeaders,
  CSRF_HEADER_NAME,
  CSRF_HEADER_VALUE,
} from "./authHeaders";
export { AuthApiError } from "./authErrors";

let refreshInFlight: Promise<TokenResponse> | null = null;

export async function loginRequest(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(authUrl(AUTH_ROUTES.login), {
    method: "POST",
    credentials: "include",
    headers: AUTH_JSON_HEADERS,
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseAuthError(response));
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshSessionRequest(fetcher: typeof fetch = fetch): Promise<TokenResponse> {
  const response = await fetcher(authUrl(AUTH_ROUTES.refresh), {
    method: "POST",
    credentials: "include",
    headers: AUTH_ACCEPT_HEADERS,
  });

  if (!response.ok) {
    clearAuthSession();
    throw new AuthApiError(response.status, await parseAuthError(response));
  }

  const token = (await response.json()) as TokenResponse;
  persistTokenResponse(token);
  return token;
}

export async function logoutRequest(fetcher: typeof fetch = fetch): Promise<void> {
  await fetcher(authUrl(AUTH_ROUTES.logout), {
    method: "POST",
    credentials: "include",
    headers: buildAuthHeaders(AUTH_CSRF_HEADERS),
  });
  clearAuthSession();
}

export async function signupRequest(payload: SignupRequest): Promise<SignupResponse> {
  const response = await fetch(authUrl(AUTH_ROUTES.signup), {
    method: "POST",
    credentials: "include",
    headers: AUTH_JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseAuthError(response));
  }

  return (await response.json()) as SignupResponse;
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetch(authUrl(AUTH_ROUTES.me), {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseAuthError(response));
  }

  return (await response.json()) as AuthenticatedUser;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const firstResponse = await fetcher(input, withAuth(init));
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  await refreshSessionOnce(fetcher);
  return fetcher(input, withAuth(init));
}

export async function refreshSessionOnce(fetcher: typeof fetch = fetch): Promise<TokenResponse> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSessionRequest(fetcher).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function persistTokenResponse(token: TokenResponse): void {
  storeAuthSession({
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in_minutes * 60_000).toISOString(),
    user: { username: token.username, role: token.role },
  });
}
