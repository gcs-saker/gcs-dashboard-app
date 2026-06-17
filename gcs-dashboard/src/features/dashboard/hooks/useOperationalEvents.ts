import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DASHBOARD_QUERY_KEYS } from "../../stateContracts";
import { fetchOperationalEvents } from "../operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "../operationalEvents";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

export function useOperationalEvents(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  pollIntervalMs = 10_000,
): OperationalEventsState {
  const queryFilters = useMemo(() => ({ ...filters }), [filters]);
  const query = useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.operationalEvents, queryFilters],
    queryFn: ({ signal }) =>
      fetchOperationalEvents(
        queryFilters,
        ((input, init) => fetcher(input, { ...init, signal })) as typeof fetch,
      ),
    refetchInterval: pollIntervalMs > 0 ? pollIntervalMs : false,
  });

  return {
    events: query.data ?? [],
    errorMessage: query.error instanceof Error ? query.error.message : null,
    isLoading: query.isLoading || query.isFetching,
    lastUpdatedAt: query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null,
  };
}
