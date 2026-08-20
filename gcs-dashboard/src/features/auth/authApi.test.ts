import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AUTH_ACCEPT_HEADERS, CSRF_HEADER_NAME, CSRF_HEADER_VALUE,
  authenticatedFetch, loginRequest, logoutRequest, refreshSessionRequest,
} from "./authApi";
import { clearAuthSession, getStoredAccessToken, storeAuthSession } from "./authStorage";

const AUTH_RESPONSE_DETAILS = {
  group_id: "co-a",
  securityVersion: 1,
  capabilities: {
    canView: true,
    canControl: true,
    canManage: false,
    canSendTalkback: true,
    canPublish: true,
    canManageMembers: false,
    canManageDevices: false,
  },
};

describe("authenticatedFetch", () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
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
          ...AUTH_RESPONSE_DETAILS,
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const response = await authenticatedFetch("/api/v1/streams", { headers: { Accept: "application/json" } }, fetcher);

    expect(response.status).toBe(200);
    expect(getStoredAccessToken()).toBe("fresh-access-token");
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/auth-policy/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "include", headers: AUTH_ACCEPT_HEADERS }),
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

  test("coalesces concurrent 401 responses into one refresh request", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/auth-policy/auth/refresh") {
        return Response.json({
          access_token: "fresh-access-token",
          token_type: "bearer",
          expires_in_minutes: 30,
          username: "operator01",
          role: "operator",
          ...AUTH_RESPONSE_DETAILS,
        });
      }

      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.Authorization === "Bearer fresh-access-token") {
        return Response.json({ ok: true });
      }

      return Response.json({ detail: "token expired" }, { status: 401 });
    });

    const [streamsResponse, statusResponse, iceResponse] = await Promise.all([
      authenticatedFetch("/api/v1/streams", {}, fetcher),
      authenticatedFetch("/api/v1/system/status", {}, fetcher),
      authenticatedFetch("/api/v1/streams/ice-servers", {}, fetcher),
    ]);

    expect(streamsResponse.status).toBe(200);
    expect(statusResponse.status).toBe(200);
    expect(iceResponse.status).toBe(200);
    expect(getStoredAccessToken()).toBe("fresh-access-token");
    expect(fetcher.mock.calls.filter(([input]) => String(input) === "/auth-policy/auth/refresh")).toHaveLength(1);
  });

  test("signup uses the auth-policy API base URL by default", async () => {
    vi.resetModules();
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          id: 2,
          username: "viewer02",
          email: "viewer02@example.com",
          company_id: 1,
          role: "viewer",
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { signupRequest } = await import("./authApi");

    await signupRequest({
      username: "viewer02",
      email: "viewer02@example.com",
      password: "strong-password",
      inviteCode: "A4AI01",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/auth-policy/auth/signup",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({ [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE }),
      }),
    );
  });

  test("logout sends csrf and memory bearer token so the backend can audit the principal", async () => {
    storeAuthSession({
      accessToken: "logout-access-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: "operator01", role: "operator" },
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

    await logoutRequest(fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "/auth-policy/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
          Authorization: "Bearer logout-access-token",
        }),
      }),
    );
    expect(getStoredAccessToken()).toBeNull();
  });

  test("clears the local session even when the logout request fails", async () => {
    storeAuthSession({
      accessToken: "logout-access-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: "operator01", role: "operator" },
    });

    await expect(logoutRequest(vi.fn(async () => { throw new TypeError("offline"); }))).rejects.toThrow("offline");

    expect(getStoredAccessToken()).toBeNull();
  });

  test("rejects malformed auth payloads at the response boundary", async () => {
    const malformedFetcher = vi.fn(async () => Response.json({ access_token: "incomplete" }));

    await expect(refreshSessionRequest(malformedFetcher)).rejects.toThrow();
    expect(getStoredAccessToken()).toBeNull();
  });

  test("aborts authentication requests after the bounded timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      })));

    const request = loginRequest({ username: "operator01", password: "password" });
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(10_000);

    await rejection;
  });
});
