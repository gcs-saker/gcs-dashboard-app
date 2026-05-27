import { describe, expect, test, vi } from "vitest";
import { fetchDashboardServerStatus, serverHealthText } from "./serverStatus";

describe("serverStatus", () => {
  test("summarizes live backend status responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(status.server).toBe("online");
    expect(status.readiness).toBe("online");
    expect(status.streams).toBe("online");
    expect(status.latencyMs).toBeGreaterThan(0);
  });

  test("reports error when backend probes fail", async () => {
    const status = await fetchDashboardServerStatus(vi.fn().mockRejectedValue(new Error("offline")));

    expect(status.server).toBe("error");
    expect(status.readiness).toBe("error");
    expect(status.streams).toBe("error");
    expect(serverHealthText(status.server)).toBe("오류");
  });
});
