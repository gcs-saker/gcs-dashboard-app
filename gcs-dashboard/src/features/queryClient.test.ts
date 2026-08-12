import { describe, expect, test, vi } from "vitest";
import {
  createDashboardQueryClient,
  dashboardRefetchInterval,
  DASHBOARD_QUERY_DEFAULTS,
  dashboardStaleTimeForPolling,
  withAbortSignal,
} from "@features/queryClient";

describe("queryClient", () => {
  test("keeps default server-state caching policy centralized", () => {
    const client = createDashboardQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBe(DASHBOARD_QUERY_DEFAULTS.staleTimeMs);
    expect(client.getDefaultOptions().queries?.gcTime).toBe(DASHBOARD_QUERY_DEFAULTS.gcTimeMs);
    expect(client.getDefaultOptions().queries?.refetchIntervalInBackground).toBe(false);
    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  test("does not retry permanent auth or route failures", () => {
    const retry = createDashboardQueryClient().getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe("function");
    if (typeof retry !== "function") return;
    expect(retry(0, errorWithStatus(401))).toBe(false);
    expect(retry(0, errorWithStatus(404))).toBe(false);
    expect(retry(0, errorWithStatus(503))).toBe(true);
    expect(retry(1, errorWithStatus(503))).toBe(false);
  });

  test("normalizes polling and stale-time policy for server state hooks", () => {
    expect(dashboardRefetchInterval(5000)).toBe(5000);
    expect(dashboardRefetchInterval(0)).toBe(false);
    expect(dashboardStaleTimeForPolling(10_000, 5000)).toBe(5000);
    expect(dashboardStaleTimeForPolling(2000, 5000)).toBe(2000);
    expect(dashboardStaleTimeForPolling(0, 5000)).toBe(5000);
  });

  test("injects TanStack Query abort signals into fetch transports", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    await withAbortSignal(fetcher, controller.signal)("/api/health", { headers: { Accept: "application/json" } });

    expect(fetcher).toHaveBeenCalledWith("/api/health", expect.objectContaining({
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }));
  });
});

function errorWithStatus(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}
