import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@features/stateContracts";
import {
  DASHBOARD_QUERY_POLICY,
  withAbortSignal,
} from "@features/queryClient";
import { fetchOperationalEventMetrics } from "@dashboard/operations/operationalEventsApi";
import type { OperationalEventFilters, OperationalEventMetrics } from "@dashboard/operations/operationalEvents";

interface OperationalEventMetricsState {
  metrics: OperationalEventMetrics | null;
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

export function useOperationalEventMetrics(
  sessionScope: string,
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): OperationalEventMetricsState {
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEY_FACTORY.operationalEventMetrics(sessionScope, queryFilters),
    queryFn: ({ signal }) =>
      fetchOperationalEventMetrics(
        queryFilters,
        withAbortSignal(fetcher, signal),
      ),
    staleTime: DASHBOARD_QUERY_POLICY.operationsStaleTimeMs,
  });

  return {
    metrics: query.data ?? null,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}
