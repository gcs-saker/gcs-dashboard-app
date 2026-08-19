import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "@/App";
import { AUTH_JSON_HEADERS } from "./authApi";
import { clearAuthSession, getStoredAccessToken, storeAuthSession } from "./authStorage";

vi.mock("../streaming/components/StreamingSmokeDashboard", () => ({
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Vitest requires this component inside its hoisted mock factory.
  StreamingSmokeDashboard: function MockStreamingSmokeDashboard() {
    return <div data-testid="streaming-smoke-dashboard">Streaming smoke</div>;
  },
}));

describe("LoginPage auth flow", () => {
  const AUTH_REFRESH_URL = "/auth-policy/auth/refresh";
  const AUTH_LOGIN_URL = "/auth-policy/auth/login";
  const ISSUED_TOKEN_RESPONSE = {
    access_token: "issued-access-token",
    token_type: "bearer",
    expires_in_minutes: 30,
    username: "operator01",
    role: "operator",
  } as const;

  function mockRefreshMissingThenLogin(loginResponse: Response): void {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === AUTH_REFRESH_URL) {
        return Response.json({ detail: "refresh token required" }, { status: 401 });
      }
      return loginResponse;
    });
  }

  beforeEach(() => {
    clearAuthSession();
    window.history.pushState({}, "", "/login?redirect=%2Fops");
  });

  afterEach(() => {
    clearAuthSession();
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  test("logs in, stores token, and redirects to the requested path", async () => {
    mockRefreshMissingThenLogin(Response.json(ISSUED_TOKEN_RESPONSE));

    render(<App />);

    await userEvent.type(await screen.findByLabelText("아이디", {}, { timeout: 10_000 }), "operator01");
    await userEvent.type(screen.getByLabelText("비밀번호"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "접속" }));

    await waitFor(() => expect(getStoredAccessToken()).toBe("issued-access-token"));
    expect(window.location.pathname).toBe("/ops");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      AUTH_LOGIN_URL,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: AUTH_JSON_HEADERS,
        body: JSON.stringify({ username: "operator01", password: "correct-password" }),
      }),
    );
  });

  test("keeps the user on login when credentials are rejected", async () => {
    mockRefreshMissingThenLogin(Response.json({ detail: "Invalid credentials" }, { status: 401 }));

    render(<App />);

    await userEvent.type(await screen.findByLabelText("아이디"), "operator01");
    await userEvent.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await userEvent.click(await screen.findByRole("button", { name: "접속" }));

    expect(await screen.findByText("아이디 또는 비밀번호가 올바르지 않습니다.")).toBeInTheDocument();
    expect(getStoredAccessToken()).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("blocks submit and shows schema errors when required fields are empty", async () => {
    mockRefreshMissingThenLogin(Response.json(ISSUED_TOKEN_RESPONSE));

    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "접속" }));

    expect(await screen.findByText("아이디를 입력해주세요.")).toBeInTheDocument();
    expect(screen.getByText("비밀번호를 입력해주세요.")).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      AUTH_LOGIN_URL,
      expect.anything(),
    );
  });

  test("links unauthenticated users to signup", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ detail: "refresh token required" }, { status: 401 }));

    render(<App />);

    await userEvent.click(await screen.findByRole("link", { name: "회원가입" }));

    expect(await screen.findByRole("heading", { name: "회원가입" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/signup");
  });

  test("redirects an already authenticated user away from login", async () => {
    storeAuthSession({
      accessToken: "active-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: "operator01", role: "operator" },
    });
    window.history.pushState({}, "", "/login");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  test("rejects external redirect URLs after login", async () => {
    mockRefreshMissingThenLogin(Response.json(ISSUED_TOKEN_RESPONSE));
    window.history.pushState({}, "", "/login?redirect=https%3A%2F%2Fevil.example");

    render(<App />);

    await userEvent.type(await screen.findByLabelText("아이디"), "operator01");
    await userEvent.type(screen.getByLabelText("비밀번호"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "접속" }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
  });

  test("clears expired frontend sessions instead of treating them as authenticated", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ detail: "refresh token required" }, { status: 401 }));
    window.localStorage.setItem(
      "gcs_saker_auth_session",
      JSON.stringify({
        accessToken: "expired-token",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        user: { username: "operator01", role: "operator" },
      }),
    );
    window.history.pushState({}, "", "/");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "대시보드 로그인" })).toBeInTheDocument();
    expect(getStoredAccessToken()).toBeNull();
    expect(window.localStorage.getItem("gcs_saker_auth_session")).toBeNull();
  });
});
