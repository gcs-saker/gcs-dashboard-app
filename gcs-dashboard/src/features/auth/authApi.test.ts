import { afterEach, describe, expect, test, vi } from "vitest";
import { authenticatedFetch } from "./authApi";
import { clearAuthSession, getStoredAccessToken } from "./authStorage";

describe("authenticatedFetch", () => {
  afterEach(() => {
    clearAuthSession();
    vi.restoreAllMocks();
  });

  test("refreshes the httpOnly cookie session once after a 401 and retries the original request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ detail: "token expired" }, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          access_token: "fresh-access-token",
          token_type: "bearer",
          expires_in_minutes: 30,
          username: "operator01",
          role: "operator",
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const response = await authenticatedFetch("/api/v1/streams", { headers: { Accept: "application/json" } }, fetcher);

    expect(response.status).toBe(200);
    expect(getStoredAccessToken()).toBe("fresh-access-token");
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/streams",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer fresh-access-token",
        }),
      }),
    );
  });
});
