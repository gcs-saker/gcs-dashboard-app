import { beforeEach, describe, expect, test, vi } from "vitest";

import { acknowledgePublishSessionAlert, publishSessionRunbook } from "./publishSessionRunbook";
import { authenticatedFetch } from "@auth/authApi";

vi.mock("@auth/authApi", () => ({ authenticatedFetch: vi.fn() }));

describe("publishSessionRunbook", () => {
  beforeEach(() => vi.mocked(authenticatedFetch).mockReset());
  test("maps only bounded readiness reasons to delivery runbook guidance", () => {
    expect(publishSessionRunbook("store_unavailable")?.id).toBe("RUN-PUB-01");
    expect(publishSessionRunbook("scan_truncated")?.id).toBe("RUN-PUB-02");
    expect(publishSessionRunbook("session_age_exceeded")?.id).toBe("RUN-PUB-03");
    expect(publishSessionRunbook("private redis error")).toBeNull();
    expect(publishSessionRunbook(null)).toBeNull();
  });

  test("posts only the bounded runbook transition payload", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(null, { status: 200 }));

    await acknowledgePublishSessionAlert("RUN-PUB-02", "in_progress", vi.fn());

    expect(authenticatedFetch).toHaveBeenCalledWith(
      "/api/v1/operations/alerts/acknowledgements",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ runbookId: "RUN-PUB-02", state: "in_progress" }),
      }),
      expect.any(Function),
    );
  });
});
