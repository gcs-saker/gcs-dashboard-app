import { describe, expect, test, vi } from "vitest";
import { AuthApiError } from "../auth/authApi";
import { fetchDashboardServerStatus, healthFromLatency, serverHealthText } from "./serverStatus";

describe("serverStatus", () => {
  test("summarizes live backend status responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("media", { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/healthz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/readyz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(3, "/media-control/healthz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(4, "/api/v1/streams", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(status.apiServer).toBe("online");
    expect(status.authServer).toBe("online");
    expect(status.signalingServer).toBe("online");
    expect(status.readiness).toBe("online");
    expect(status.streams).toBe("online");
    expect(status.latencyMs).toBeGreaterThan(0);
    expect(status.checkedAt).toBeGreaterThan(0);
  });

  test("reports error when backend probes fail", async () => {
    const status = await fetchDashboardServerStatus(vi.fn().mockRejectedValue(new Error("offline")));

    expect(status.apiServer).toBe("error");
    expect(status.readiness).toBe("error");
    expect(status.streams).toBe("error");
    expect(serverHealthText(status.apiServer)).toBe("오류");
  });

  test("surfaces stream status 401 so polling can stop and logout", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("media", { status: 200 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ detail: "refresh token required" }, { status: 401 }));

    await expect(fetchDashboardServerStatus(fetcher as unknown as typeof fetch)).rejects.toMatchObject({
      status: 401,
      name: "AuthApiError",
    } satisfies Partial<AuthApiError>);
  });

  test("downgrades health when response latency rises", () => {
    expect(healthFromLatency(80)).toBe("online");
    expect(healthFromLatency(700)).toBe("degraded");
    expect(healthFromLatency(1400)).toBe("error");
  });
});
