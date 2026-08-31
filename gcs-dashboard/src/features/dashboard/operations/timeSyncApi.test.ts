import { describe, expect, test, vi } from "vitest";
import { checkTimeSync, fetchTimeSyncStatus, updateTimeSyncConfig } from "@dashboard/operations/timeSyncApi";

const status = {
  mode: "public",
  sourceHost: "pool.ntp.org",
  sourcePort: 123,
  driftWarnMs: 1000,
  updatedAt: "1970-01-01T00:00:00Z",
  updatedBy: "system",
  serverTime: "2026-06-01T00:00:00Z",
  monotonicMs: 42000,
  timezone: "UTC",
  checkedAt: "2026-06-01T00:00:00Z",
  health: "ok",
  message: "pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.",
};

describe("timeSyncApi", () => {
  test("fetchTimeSyncStatus requests the status endpoint", async () => {
    const fetcher = vi.fn(async () => jsonResponse(status));

    await expect(fetchTimeSyncStatus(fetcher)).resolves.toEqual(status);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ops/time/status",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
  });

  test("checkTimeSync posts to the check endpoint", async () => {
    const fetcher = vi.fn(async () => jsonResponse(status));

    await expect(checkTimeSync(fetcher)).resolves.toEqual(status);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/ops/time/check",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  test("updateTimeSyncConfig sends closed network config", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ...status, mode: "closed_network", sourceHost: "10.0.0.10" }));

    await updateTimeSyncConfig(
      { mode: "closed_network", sourceHost: "10.0.0.10", sourcePort: 123, driftWarnMs: 500 },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/ops/time/config",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          mode: "closed_network",
          sourceHost: "10.0.0.10",
          sourcePort: 123,
          driftWarnMs: 500,
        }),
      }),
    );
  });

  test("rejects invalid response payload", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ mode: "public" }));

    await expect(fetchTimeSyncStatus(fetcher)).rejects.toThrow("Time sync response is invalid");
  });
});

function jsonResponse(payload: unknown, statusCode = 200): Response {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    json: async () => payload,
  } as Response;
}
