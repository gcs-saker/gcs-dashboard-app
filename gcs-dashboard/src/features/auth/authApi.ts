import { apiUrl } from "../../config";
import { clearAuthSession, getStoredAccessToken, storeAuthSession } from "./authStorage";
import type { AuthenticatedUser, LoginRequest, SignupRequest, SignupResponse, TokenResponse } from "./types";

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
  const response = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as TokenResponse;
}

export async function refreshSessionRequest(fetcher: typeof fetch = fetch): Promise<TokenResponse> {
  const response = await fetcher(apiUrl("/auth/refresh"), {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
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
  await fetcher(apiUrl("/auth/logout"), {
    method: "POST",
    credentials: "include",
  });
  clearAuthSession();
}

export async function signupRequest(payload: SignupRequest): Promise<SignupResponse> {
  const response = await fetch(apiUrl("/auth/signup"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as SignupResponse;
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetch(apiUrl("/auth/me"), {
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
