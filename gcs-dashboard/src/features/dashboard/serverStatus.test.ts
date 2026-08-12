import { describe, expect, test, vi } from "vitest";
import { fetchDashboardServerStatus, healthFromLatency, serverHealthText } from "./serverStatus";

describe("serverStatus", () => {
  test("summarizes active cutover status responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("media", { status: 200 }))
      .mockResolvedValueOnce(new Response("media-ready", { status: 200 }))
      .mockResolvedValueOnce(Response.json({ stream: "ready", service: "media-control", deprecated: true }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/healthz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/readyz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(3, "/media-control/healthz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(4, "/media-control/readyz", { headers: undefined });
    expect(fetcher).toHaveBeenNthCalledWith(5, "/stream/status", { headers: undefined });
    expect(status.apiServer).toBe("online");
    expect(status.authServer).toBe("online");
    expect(status.signalingServer).toBe("online");
    expect(status.readiness).toBe("online");
    expect(status.streams).toBe("online");
    expect(status.latencyMs).toBeGreaterThan(0);
    expect(status.checkedAt).toBeGreaterThan(0);
  });

  test("marks signaling degraded when media-control process is alive but readiness fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("media", { status: 200 }))
      .mockResolvedValueOnce(Response.json({ status: "degraded" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ stream: "ready", service: "media-control", deprecated: true }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(status.apiServer).toBe("online");
    expect(status.signalingServer).toBe("degraded");
    expect(status.streams).toBe("online");
  });

  test("reports error when backend probes fail", async () => {
    const status = await fetchDashboardServerStatus(vi.fn().mockRejectedValue(new Error("offline")));

    expect(status.apiServer).toBe("error");
    expect(status.readiness).toBe("error");
    expect(status.streams).toBe("error");
    expect(serverHealthText(status.apiServer)).toBe("오류");
  });

  test("keeps successful probes visible when one endpoint rejects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockRejectedValueOnce(new TypeError("temporary signaling network failure"))
      .mockResolvedValueOnce(new Response("media-ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("stream", { status: 200 }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(status.apiServer).toBe("online");
    expect(status.authServer).toBe("online");
    expect(status.signalingServer).toBe("error");
    expect(status.readiness).toBe("online");
    expect(status.streams).toBe("online");
  });

  test("does not require auth token for the operational stream status probe", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ready", { status: 200 }))
      .mockResolvedValueOnce(new Response("media", { status: 200 }))
      .mockResolvedValueOnce(new Response("media-ready", { status: 200 }))
      .mockResolvedValueOnce(Response.json({ stream: "ready", service: "media-control", deprecated: true }));

    const status = await fetchDashboardServerStatus(fetcher as unknown as typeof fetch);

    expect(status.streams).toBe("online");
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher).toHaveBeenNthCalledWith(5, "/stream/status", { headers: undefined });
  });

  test("downgrades health when response latency rises", () => {
    expect(healthFromLatency(80)).toBe("online");
    expect(healthFromLatency(700)).toBe("degraded");
    expect(healthFromLatency(1400)).toBe("error");
  });
});
