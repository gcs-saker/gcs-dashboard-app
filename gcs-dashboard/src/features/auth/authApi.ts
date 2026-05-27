import { apiUrl } from "../../config";
import { getStoredAccessToken } from "./authStorage";
import type { AuthenticatedUser, LoginRequest, SignupRequest, SignupResponse, TokenResponse } from "./types";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    throw new AuthApiError(response.status, await parseError(response));
  }

  return (await response.json()) as TokenResponse;
}

export async function signupRequest(payload: SignupRequest): Promise<SignupResponse> {
  const response = await fetch(apiUrl("/auth/signup"), {
    method: "POST",
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
