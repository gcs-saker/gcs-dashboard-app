import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AuthApiError } from "@auth/authApi";
import {
  dashboardRefetchInterval,
  dashboardStaleTimeForPolling,
  DASHBOARD_QUERY_POLICY,
  withAbortSignal,
} from "@/features/queryClient";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@/features/stateContracts";
import { registerSessionScopedCache } from "@/features/sessionScopedCache";
import {
  loadSystemStatusLocalCache,
  saveSystemStatusLocalCache,
} from "@dashboard/preferences/dashboardLocalCache";
import {
  fetchDashboardServerStatus,
  type DashboardServerStatusSnapshot,
} from "@dashboard/operations/serverStatus";
import { appendRttSample, type RttSample } from "@dashboard/operations/systemStatusRtt";
import {
  buildSystemStatusViewModel,
  type SystemStatusViewModel,
} from "@dashboard/operations/systemStatusViewModel";
import {
  resetSystemStatusMemoryStore,
  systemStatusMemoryStore,
} from "@dashboard/stores/systemStatusMemoryStore";

interface UseSystemStatusModelInput {
  fetcher?: typeof fetch;
  onAuthFailure?: () => void;
  refreshMs: number;
}

export function resetSystemStatusModelMemoryCache(): void {
  resetSystemStatusMemoryStore();
}

registerSessionScopedCache(resetSystemStatusModelMemoryCache);

export function useSystemStatusModel({
  fetcher,
  onAuthFailure,
  refreshMs,
}: UseSystemStatusModelInput): {
  status: DashboardServerStatusSnapshot;
  viewModel: SystemStatusViewModel;
} {
  const initialCache = systemStatusMemoryStore.getState();
  const [rttHistory, setRttHistory] = useState<RttSample[]>(() => initialCache.rttHistory);
  const [cachedStatus, setCachedStatus] = useState<DashboardServerStatusSnapshot | null>(() =>
    initialCache.status.checkedAt ? initialCache.status : null,
  );
  const statusQuery = useQuery({
    queryFn: ({ signal }) => fetchDashboardServerStatus(withAbortSignal(fetcher ?? globalThis.fetch, signal)),
    queryKey: DASHBOARD_QUERY_KEY_FACTORY.serverStatus(refreshMs, fetcher ? "custom-fetcher" : "default-fetcher"),
    initialData: initialCache.status,
    initialDataUpdatedAt: 0,
    refetchInterval: dashboardRefetchInterval(refreshMs),
    staleTime: dashboardStaleTimeForPolling(refreshMs, DASHBOARD_QUERY_POLICY.statusStaleTimeMs),
  });
  const freshStatus = statusQuery.data;
  const status = freshStatus.checkedAt ? freshStatus : cachedStatus ?? freshStatus;
  const viewModel = useMemo(() => buildSystemStatusViewModel(status, rttHistory), [rttHistory, status]);

  useEffect(() => {
    let disposed = false;
    void loadSystemStatusLocalCache().then((cache) => {
      if (disposed) return;
      systemStatusMemoryStore.setState(cache, true);
      setCachedStatus(cache.status.checkedAt ? cache.status : null);
      setRttHistory(cache.rttHistory);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (statusQuery.error instanceof AuthApiError && statusQuery.error.status === 401) {
      onAuthFailure?.();
    }
  }, [onAuthFailure, statusQuery.error]);

  useEffect(() => {
    if (!freshStatus.checkedAt) return;
    setCachedStatus(freshStatus);
    setRttHistory((current) => updateRttHistoryCache(current, freshStatus));
  }, [freshStatus]);

  return { status, viewModel };
}

function updateRttHistoryCache(
  current: RttSample[],
  status: DashboardServerStatusSnapshot,
): RttSample[] {
  const next = appendRttSample(current, {
    checkedAt: status.checkedAt ?? Date.now(),
    latencyMs: status.latencyMs,
  });
  systemStatusMemoryStore.setState({ rttHistory: next, status }, true);
  void saveSystemStatusLocalCache(status, next);
  return next;
}
