import { QueryClient } from "@tanstack/react-query";

export const DASHBOARD_QUERY_DEFAULTS = Object.freeze({
  staleTimeMs: 2_000,
  gcTimeMs: 60_000,
  retryCount: 1,
  refetchOnWindowFocus: false,
} as const);

export function createDashboardQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DASHBOARD_QUERY_DEFAULTS.staleTimeMs,
        gcTime: DASHBOARD_QUERY_DEFAULTS.gcTimeMs,
        retry: DASHBOARD_QUERY_DEFAULTS.retryCount,
        refetchOnWindowFocus: DASHBOARD_QUERY_DEFAULTS.refetchOnWindowFocus,
      },
    },
  });
}
