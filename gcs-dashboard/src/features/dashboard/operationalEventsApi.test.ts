import { describe, expect, test, vi } from "vitest";
import { buildOperationalEventsUrl, fetchOperationalEvents } from "./operationalEventsApi";
import type { OperationalEventFilters } from "./operationalEvents";

describe("operationalEventsApi", () => {
  test("builds server-side filtering query parameters", () => {
    const filters: OperationalEventFilters = {
      query: " ice ",
      severity: "warn",
      from: "2026-06-01T09:00",
      to: "",
    };

    expect(buildOperationalEventsUrl(filters)).toContain("/api/ops/events?query=ice&severity=warn&from=");
  });

  test("fetches and validates operational event payloads", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          id: "evt-001",
          occurredAt: "2026-06-01T00:00:00Z",
          severity: "info",
          category: "api",
          source: "API 서버",
          message: "헬스체크 정상",
          connections: 1,
          latencyMs: 42,
          throughputMbps: 10,
        },
      ]),
    );

    const events = await fetchOperationalEvents({ query: "", severity: "all", from: "", to: "" }, fetcher);

    expect(events).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/ops/events", expect.objectContaining({ credentials: "include" }));
  });

  test("rejects malformed operational event payloads before rendering", async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ id: "bad" }]));

    await expect(
      fetchOperationalEvents({ query: "", severity: "all", from: "", to: "" }, fetcher),
    ).rejects.toThrow("Operational events response is invalid");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
