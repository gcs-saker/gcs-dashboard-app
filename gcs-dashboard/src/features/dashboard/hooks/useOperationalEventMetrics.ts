import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEYS } from "../../stateContracts";
import { fetchOperationalEventMetrics } from "../operationalEventsApi";
import type { OperationalEventFilters, OperationalEventMetrics } from "../operationalEvents";

interface OperationalEventMetricsState {
  metrics: OperationalEventMetrics | null;
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

export function useOperationalEventMetrics(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  pollIntervalMs = 10_000,
): OperationalEventMetricsState {
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const query = useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.operationalEventMetrics, queryFilters],
    queryFn: ({ signal }) =>
      fetchOperationalEventMetrics(
        queryFilters,
        ((input, init) => fetcher(input, { ...init, signal })) as typeof fetch,
      ),
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
  });

  return {
    metrics: query.data ?? null,
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}
