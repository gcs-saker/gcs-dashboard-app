const AUTH_REQUEST_TIMEOUT_MS = 10_000;

export async function authFetchWithTimeout(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}
