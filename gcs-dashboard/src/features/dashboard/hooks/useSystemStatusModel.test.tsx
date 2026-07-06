import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthApiError } from "@auth/authApi";
import { createDashboardQueryClient } from "@/features/queryClient";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import type { DashboardServerStatusSnapshot } from "@dashboard/serverStatus";
import {
  resetSystemStatusModelMemoryCache,
  useSystemStatusModel,
} from "./useSystemStatusModel";

const loadSystemStatusLocalCache = vi.fn();
const saveSystemStatusLocalCache = vi.fn();
const fetchDashboardServerStatus = vi.fn();

vi.mock("@dashboard/dashboardLocalCache", () => ({
  loadSystemStatusLocalCache: () => loadSystemStatusLocalCache(),
  saveSystemStatusLocalCache: (...args: unknown[]) => saveSystemStatusLocalCache(...args),
}));

vi.mock("@dashboard/serverStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dashboard/serverStatus")>();
  return {
    ...actual,
    fetchDashboardServerStatus: (...args: unknown[]) => fetchDashboardServerStatus(...args),
  };
});

const FRESH_STATUS: DashboardServerStatusSnapshot = {
  apiServer: DASHBOARD_SERVER_HEALTH.online,
  authServer: DASHBOARD_SERVER_HEALTH.online,
  checkedAt: 1_782_489_600_000,
  latencyMs: 42,
  readiness: DASHBOARD_SERVER_HEALTH.online,
  signalingServer: DASHBOARD_SERVER_HEALTH.online,
  streams: DASHBOARD_SERVER_HEALTH.online,
};

describe("useSystemStatusModel", () => {
  afterEach(() => {
    resetSystemStatusModelMemoryCache();
    vi.clearAllMocks();
  });

  test("hydrates status and RTT history from IndexedDB before fresh probes arrive", async () => {
    loadSystemStatusLocalCache.mockResolvedValue({
      rttHistory: [{ checkedAt: FRESH_STATUS.checkedAt, latencyMs: 42 }],
      status: FRESH_STATUS,
    });
    fetchDashboardServerStatus.mockResolvedValue({ ...FRESH_STATUS, checkedAt: null, latencyMs: null });

    const { result } = renderHook(() => useSystemStatusModel({ refreshMs: 0 }), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.status.checkedAt).toBe(FRESH_STATUS.checkedAt));
    expect(result.current.viewModel.latestRttText).toBe("42 ms");
  });

  test("saves fresh server status and RTT samples back to the local cache", async () => {
    loadSystemStatusLocalCache.mockResolvedValue({ rttHistory: [], status: { ...FRESH_STATUS, checkedAt: null } });
    fetchDashboardServerStatus.mockResolvedValue(FRESH_STATUS);

    const { result } = renderHook(() => useSystemStatusModel({ refreshMs: 0 }), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.status.latencyMs).toBe(42));
    await waitFor(() => expect(saveSystemStatusLocalCache).toHaveBeenCalledWith(
      FRESH_STATUS,
      [{ checkedAt: FRESH_STATUS.checkedAt, latencyMs: 42 }],
    ));
  });

  test("notifies auth failure when the status query receives a 401", async () => {
    const onAuthFailure = vi.fn();
    loadSystemStatusLocalCache.mockResolvedValue({ rttHistory: [], status: { ...FRESH_STATUS, checkedAt: null } });
    fetchDashboardServerStatus.mockRejectedValue(new AuthApiError(401, "expired"));

    renderHook(() => useSystemStatusModel({ onAuthFailure, refreshMs: 0 }), { wrapper: queryWrapper() });

    await waitFor(() => expect(onAuthFailure).toHaveBeenCalledTimes(1));
  });
});

function queryWrapper() {
  const queryClient = createDashboardQueryClient();
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
