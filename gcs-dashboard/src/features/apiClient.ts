import { authenticatedFetch } from "./auth/authApi";

export type PayloadGuard<T> = (payload: unknown) => payload is T;

export interface ValidatedJsonRequest<T> {
  url: string;
  fetcher?: typeof fetch;
  init?: RequestInit;
  isPayload: PayloadGuard<T>;
  requestDescription: string;
  invalidPayloadDescription: string;
}

export class ApiHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export async function fetchValidatedJson<T>({
  url,
  fetcher = fetch,
  init,
  isPayload,
  requestDescription,
  invalidPayloadDescription,
}: ValidatedJsonRequest<T>): Promise<T> {
  const response = await authenticatedFetch(url, jsonRequestInit(init), fetcher);
  if (!response.ok) {
    throw new ApiHttpError(response.status, `${requestDescription} failed with ${response.status}`);
  }

  const payload = await response.json() as unknown;
  if (!isPayload(payload)) {
    throw new Error(`${invalidPayloadDescription} is invalid`);
  }
  return payload;
}

function jsonRequestInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Accept: "application/json",
      ...headersToRecord(init.headers),
    },
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
