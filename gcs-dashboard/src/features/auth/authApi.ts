import { authUrl } from "../../config";
import { clearAuthSession, getStoredAccessToken, storeAuthSession } from "./authStorage";
import type { AuthenticatedUser, LoginRequest, SignupRequest, SignupResponse, TokenResponse } from "./types";

export const CSRF_HEADER_NAME = "X-GCS-CSRF";
export const CSRF_HEADER_VALUE = "same-origin";
export const AUTH_CSRF_HEADERS = Object.freeze({
  [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
});
export const AUTH_JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json",
  [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
});
export const AUTH_ACCEPT_HEADERS = Object.freeze({
  Accept: "application/json",
  [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
});

let refreshInFlight: Promise<TokenResponse> | null = null;

export class AuthApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? "authentication request failed";
  } catch {
    return "authentication request failed";
  }
}

export async function loginRequest(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(authUrl("/login"), {
    method: "POST",
    credentials: "include",
    headers: AUTH_JSON_HEADERS,
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshSessionRequest(fetcher: typeof fetch = fetch): Promise<TokenResponse> {
  const response = await fetcher(authUrl("/refresh"), {
    method: "POST",
    credentials: "include",
    headers: AUTH_ACCEPT_HEADERS,
  });

  if (!response.ok) {
    clearAuthSession();
    throw new AuthApiError(response.status, await parseError(response));
  }

  const token = (await response.json()) as TokenResponse;
  persistTokenResponse(token);
  return token;
}

export async function logoutRequest(fetcher: typeof fetch = fetch): Promise<void> {
  await fetcher(authUrl("/logout"), {
    method: "POST",
    credentials: "include",
    headers: AUTH_CSRF_HEADERS,
  });
  clearAuthSession();
}

export async function signupRequest(payload: SignupRequest): Promise<SignupResponse> {
  const response = await fetch(authUrl("/signup"), {
    method: "POST",
    credentials: "include",
    headers: AUTH_JSON_HEADERS,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as SignupResponse;
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetch(authUrl("/me"), {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as AuthenticatedUser;
}

export function buildAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const accessToken = getStoredAccessToken();
  if (!accessToken) return headers;
  return { ...headers, Authorization: `Bearer ${accessToken}` };
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

function withAuth(init: RequestInit): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: buildAuthHeaders(headersToRecord(init.headers)),
  };
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}
