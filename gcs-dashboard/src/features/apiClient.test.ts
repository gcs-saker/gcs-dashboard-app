import { describe, expect, test, vi } from "vitest";

import { fetchValidatedJson } from "@features/apiClient";

interface SamplePayload {
  id: string;
}

function isSamplePayload(payload: unknown): payload is SamplePayload {
  return typeof payload === "object" && payload !== null && (payload as Partial<SamplePayload>).id === "ok";
}

describe("apiClient", () => {
  test("validates JSON at the API boundary", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ id: "ok" }));

    await expect(
      fetchValidatedJson({
        url: "/api/sample",
        fetcher,
        isPayload: isSamplePayload,
        requestDescription: "Sample request",
        invalidPayloadDescription: "Sample response",
      }),
    ).resolves.toEqual({ id: "ok" });
    expect(fetcher).toHaveBeenCalledWith("/api/sample", expect.objectContaining({ credentials: "include" }));
  });

  test("fails before invalid payloads enter feature state", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ id: "bad" }));

    await expect(
      fetchValidatedJson({
        url: "/api/sample",
        fetcher,
        isPayload: isSamplePayload,
        requestDescription: "Sample request",
        invalidPayloadDescription: "Sample response",
      }),
    ).rejects.toThrow("Sample response is invalid");
  });

  test("keeps HTTP failure messages explicit", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: "down" }, 503));

    await expect(
      fetchValidatedJson({
        url: "/api/sample",
        fetcher,
        isPayload: isSamplePayload,
        requestDescription: "Sample request",
        invalidPayloadDescription: "Sample response",
      }),
    ).rejects.toThrow("Sample request failed with 503");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
