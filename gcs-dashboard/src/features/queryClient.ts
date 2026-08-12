import { QueryClient } from "@tanstack/react-query";

export const DASHBOARD_QUERY_DEFAULTS = Object.freeze({
  staleTimeMs: 2_000,
  gcTimeMs: 60_000,
  retryCount: 1,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: false,
} as const);

export const DASHBOARD_QUERY_POLICY = Object.freeze({
  realtimeRefetchMs: 5_000,
  operationsRefetchMs: 10_000,
  statusStaleTimeMs: 5_000,
  operationsStaleTimeMs: 3_000,
  nonRetryableStatuses: [400, 401, 403, 404] as const,
} as const);

export function createDashboardQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DASHBOARD_QUERY_DEFAULTS.staleTimeMs,
        gcTime: DASHBOARD_QUERY_DEFAULTS.gcTimeMs,
        retry: shouldRetryDashboardQuery,
        refetchIntervalInBackground: DASHBOARD_QUERY_DEFAULTS.refetchIntervalInBackground,
        refetchOnWindowFocus: DASHBOARD_QUERY_DEFAULTS.refetchOnWindowFocus,
      },
    },
  });
}

export function dashboardRefetchInterval(intervalMs: number): number | false {
  return intervalMs > 0 ? intervalMs : false;
}

export function dashboardStaleTimeForPolling(intervalMs: number, maxStaleTimeMs: number): number {
  if (intervalMs <= 0) return maxStaleTimeMs;
  return Math.min(intervalMs, maxStaleTimeMs);
}

export function withAbortSignal(
  fetcher: typeof fetch,
  signal: AbortSignal,
): typeof fetch {
  return ((input, init) => fetcher(input, { ...init, signal })) as typeof fetch;
}

function shouldRetryDashboardQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= DASHBOARD_QUERY_DEFAULTS.retryCount) return false;
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status)
    : null;
  if (status && DASHBOARD_QUERY_POLICY.nonRetryableStatuses.includes(status as never)) {
    return false;
  }
  return true;
}
