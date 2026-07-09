import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AuthApiError } from "@auth/authApi";
import {
  dashboardRefetchInterval,
  dashboardStaleTimeForPolling,
  DASHBOARD_QUERY_POLICY,
} from "@/features/queryClient";
import { DASHBOARD_QUERY_KEY_FACTORY } from "@/features/stateContracts";
import {
  loadSystemStatusLocalCache,
  saveSystemStatusLocalCache,
} from "@dashboard/dashboardLocalCache";
import {
  DEFAULT_SERVER_STATUS,
  fetchDashboardServerStatus,
  type DashboardServerStatusSnapshot,
} from "@dashboard/serverStatus";
import { appendRttSample, type RttSample } from "@dashboard/systemStatusRtt";
import {
  buildSystemStatusViewModel,
  type SystemStatusViewModel,
} from "@dashboard/systemStatusViewModel";

interface UseSystemStatusModelInput {
  fetcher?: typeof fetch;
  onAuthFailure?: () => void;
  refreshMs: number;
}

interface SystemStatusMemoryCache {
  rttHistory: RttSample[];
  status: DashboardServerStatusSnapshot;
}

let memoryCache: SystemStatusMemoryCache = {
  rttHistory: [],
  status: DEFAULT_SERVER_STATUS,
};

export function resetSystemStatusModelMemoryCache(): void {
  memoryCache = {
    rttHistory: [],
    status: DEFAULT_SERVER_STATUS,
  };
}

export function useSystemStatusModel({
  fetcher,
  onAuthFailure,
  refreshMs,
}: UseSystemStatusModelInput): {
  status: DashboardServerStatusSnapshot;
  viewModel: SystemStatusViewModel;
} {
  const [rttHistory, setRttHistory] = useState<RttSample[]>(() => memoryCache.rttHistory);
  const [cachedStatus, setCachedStatus] = useState<DashboardServerStatusSnapshot | null>(() =>
    memoryCache.status.checkedAt ? memoryCache.status : null,
  );
  const statusQuery = useQuery({
    queryFn: () => fetchDashboardServerStatus(fetcher),
    queryKey: DASHBOARD_QUERY_KEY_FACTORY.serverStatus(refreshMs, fetcher ? "custom-fetcher" : "default-fetcher"),
    initialData: memoryCache.status,
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
      memoryCache = cache;
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
  memoryCache = { rttHistory: next, status };
  void saveSystemStatusLocalCache(status, next);
  return next;
}
