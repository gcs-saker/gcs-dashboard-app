import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "../../App";
import { AUTH_JSON_HEADERS } from "./authApi";
import { clearAuthSession } from "./authStorage";

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

describe("SignupPage auth flow", () => {
  const AUTH_REFRESH_URL = "/api/auth/refresh";
  const AUTH_SIGNUP_URL = "/api/auth/signup";

  function mockRefreshMissingThenSignup(signupResponse: Response): void {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === AUTH_REFRESH_URL) {
        return Response.json({ detail: "refresh token required" }, { status: 401 });
      }
      return signupResponse;
    });
  }

  beforeEach(() => {
    clearAuthSession();
    window.history.pushState({}, "", "/signup");
  });

  afterEach(() => {
    clearAuthSession();
    vi.restoreAllMocks();
    window.history.pushState({}, "", "/");
  });

  test("creates a user through the edge-relative signup API and redirects to login", async () => {
    mockRefreshMissingThenSignup(
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

    render(<App />);

    await userEvent.type(screen.getByLabelText("아이디"), "viewer02");
    await userEvent.type(screen.getByLabelText("이메일"), "viewer02@example.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "strong-password");
    await userEvent.type(screen.getByLabelText("비밀번호 확인"), "strong-password");
    await userEvent.type(screen.getByLabelText("초대 코드"), "A4AI01");
    await userEvent.click(screen.getByRole("button", { name: "가입" }));

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(
      await screen.findByText("viewer02 계정이 등록되었습니다. 로그인해주세요."),
    ).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      AUTH_SIGNUP_URL,
      expect.objectContaining({
        method: "POST",
        headers: AUTH_JSON_HEADERS,
        body: JSON.stringify({
          username: "viewer02",
          email: "viewer02@example.com",
          password: "strong-password",
          inviteCode: "A4AI01",
          role: "viewer",
        }),
      }),
    );
  });

  test("blocks submit when password confirmation does not match", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ detail: "refresh token required" }, { status: 401 }));

    render(<App />);

    await userEvent.type(screen.getByLabelText("아이디"), "viewer02");
    await userEvent.type(screen.getByLabelText("이메일"), "viewer02@example.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "strong-password");
    await userEvent.type(screen.getByLabelText("비밀번호 확인"), "different-password");
    await userEvent.type(screen.getByLabelText("초대 코드"), "A4AI01");
    await userEvent.click(screen.getByRole("button", { name: "가입" }));

    expect(screen.getByText("비밀번호 확인이 일치하지 않습니다.")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      AUTH_REFRESH_URL,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(window.location.pathname).toBe("/signup");
  });

  test("shows a specific message when the username already exists", async () => {
    mockRefreshMissingThenSignup(Response.json({ detail: "Username already registered" }, { status: 400 }));

    render(<App />);

    await userEvent.type(screen.getByLabelText("아이디"), "operator01");
    await userEvent.type(screen.getByLabelText("이메일"), "new-operator@example.com");
    await userEvent.type(screen.getByLabelText("비밀번호"), "strong-password");
    await userEvent.type(screen.getByLabelText("비밀번호 확인"), "strong-password");
    await userEvent.type(screen.getByLabelText("초대 코드"), "A4AI01");
    await userEvent.click(screen.getByRole("button", { name: "가입" }));

    expect(await screen.findByText("이미 등록된 아이디입니다.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/signup");
  });
});
