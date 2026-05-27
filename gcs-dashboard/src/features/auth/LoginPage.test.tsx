import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "../../App";
import { clearAccessToken, getStoredAccessToken, storeAccessToken, storeUser } from "./authStorage";

vi.mock("../../component/MainMap", () => ({
  default: function MockMainMap() {
    return <section aria-label="mock-map" />;
  },
}));

vi.mock("../../component/HLSPlayer", () => ({
  default: function MockHLSPlayer() {
    return <div data-testid="hls-player">HLS player</div>;
  },
}));

vi.mock("../../component/ControlPanel", () => ({
  default: function MockControlPanel() {
    return <div data-testid="control-panel">Control panel</div>;
  },
}));

vi.mock("../../component/TelemetryDashboard", () => ({
  default: function MockTelemetryDashboard() {
    return <div data-testid="telemetry-dashboard">samples:0</div>;
  },
}));

vi.mock("../streaming/components/StreamingSmokeDashboard", () => ({
  StreamingSmokeDashboard: function MockStreamingSmokeDashboard() {
    return <div data-testid="streaming-smoke-dashboard">Streaming smoke</div>;
  },
}));

describe("LoginPage auth flow", () => {
  beforeEach(() => {
    clearAccessToken();
    window.history.pushState({}, "", "/login?redirect=%2Fops");
  });

  afterEach(() => {
    clearAccessToken();
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  test("logs in, stores token, and redirects to the requested path", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        access_token: "issued-access-token",
        token_type: "bearer",
        expires_in_minutes: 30,
        username: "operator01",
        role: "operator",
      }),
    );

    render(<App />);

    await userEvent.type(screen.getByLabelText("아이디"), "operator01");
    await userEvent.type(screen.getByLabelText("비밀번호"), "correct-password");
    await userEvent.click(screen.getByRole("button", { name: "접속" }));

    await waitFor(() => expect(getStoredAccessToken()).toBe("issued-access-token"));
    expect(window.location.pathname).toBe("/ops");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "operator01", password: "correct-password" }),
      }),
    );
  });

  test("keeps the user on login when credentials are rejected", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ detail: "Invalid credentials" }, { status: 401 }),
    );

    render(<App />);

    await userEvent.type(screen.getByLabelText("아이디"), "operator01");
    await userEvent.type(screen.getByLabelText("비밀번호"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "접속" }));

    expect(await screen.findByText("아이디 또는 비밀번호가 올바르지 않습니다.")).toBeInTheDocument();
    expect(getStoredAccessToken()).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("links unauthenticated users to signup", async () => {
    globalThis.fetch = vi.fn();

    render(<App />);

    await userEvent.click(screen.getByRole("link", { name: "회원가입" }));

    expect(screen.getByRole("heading", { name: "회원가입" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/signup");
  });

  test("redirects an already authenticated user away from login", async () => {
    storeAccessToken("active-token");
    storeUser({ username: "operator01", role: "operator" });
    window.history.pushState({}, "", "/login");

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(screen.queryByRole("heading", { name: "대시보드 로그인" })).not.toBeInTheDocument();
  });
});
