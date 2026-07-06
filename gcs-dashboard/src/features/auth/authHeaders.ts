import { getStoredAccessToken } from "./authStorage";

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

export function buildAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const accessToken = getStoredAccessToken();
  if (!accessToken) return headers;
  return { ...headers, Authorization: `Bearer ${accessToken}` };
}

export function withAuth(init: RequestInit): RequestInit {
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
