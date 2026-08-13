import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TimeSyncSettingsView } from "./TimeSyncSettingsView";
import { SETTINGS_TABS } from "@dashboard/timeSyncSettingsContracts";
import type { UserRole } from "@auth/types";

const authState = vi.hoisted(() => ({ role: "viewer" as UserRole }));

vi.mock("@auth/AuthProvider", () => ({
  useAuth: () => ({
    currentUser: { username: "settings-test", role: authState.role },
  }),
}));

const publicStatus = {
  mode: "public",
  sourceHost: "pool.ntp.org",
  sourcePort: 123,
  driftWarnMs: 1000,
  updatedAt: "1970-01-01T00:00:00Z",
  updatedBy: "system",
  serverTime: "2026-06-01T00:00:00Z",
  monotonicMs: 42000,
  timezone: "UTC",
  checkedAt: "2026-06-01T00:00:00Z",
  health: "ok",
  message: "pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.",
};

afterEach(() => {
  authState.role = "viewer";
  vi.unstubAllGlobals();
});

describe("TimeSyncSettingsView", () => {
  test.each<UserRole>(["operator", "viewer"])("does not expose device provisioning to %s users", async (role) => {
    authState.role = role;
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(publicStatus));
    vi.stubGlobal("fetch", fetcher);

    render(<TimeSyncSettingsView />);
    await screen.findByText(publicStatus.message);

    const provisioningLabel = SETTINGS_TABS.find((tab) => tab.id === "provisioning")?.label;
    expect(provisioningLabel).toBeDefined();
    expect(screen.queryByRole("button", { name: provisioningLabel })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("/admin/"))).toBe(false);
  });

  test("exposes device provisioning to administrators", async () => {
    authState.role = "admin";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(publicStatus)));
    const user = userEvent.setup();

    render(<TimeSyncSettingsView />);
    await screen.findByText(publicStatus.message);

    const provisioningLabel = SETTINGS_TABS.find((tab) => tab.id === "provisioning")?.label;
    expect(provisioningLabel).toBeDefined();
    await user.click(screen.getByRole("button", { name: provisioningLabel }));

    expect(screen.getByRole("button", { name: "회원가입 토큰 발급" })).toBeInTheDocument();
  });

  test("renders server time status and saves closed network config", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/config") && init?.method === "PUT") {
        return jsonResponse({
          ...publicStatus,
          mode: "closed_network",
          sourceHost: "10.10.10.10",
          driftWarnMs: 500,
          message: "10.10.10.10:123 기준으로 시간 소스가 설정되었습니다.",
        });
      }
      return jsonResponse(publicStatus);
    });
    vi.stubGlobal("fetch", fetcher);

    render(<TimeSyncSettingsView />);

    expect(screen.getByLabelText("시간 동기화 설정")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영설정" })).toBeInTheDocument();
    expect(await screen.findByText("pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "스트리밍" }));
    expect(screen.getByText("CCTV 기본")).toBeInTheDocument();
    expect(screen.getByText("선택 확대")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "시간 동기화" }));

    await user.click(screen.getByRole("button", { name: "폐쇄망" }));
    await user.clear(screen.getByLabelText("시간 서버"));
    await user.type(screen.getByLabelText("시간 서버"), "10.10.10.10");
    await user.clear(screen.getByLabelText("Drift 경고"));
    await user.type(screen.getByLabelText("Drift 경고"), "500");
    await user.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() =>
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/ops/time/config",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            mode: "closed_network",
            sourceHost: "10.10.10.10",
            sourcePort: 123,
            driftWarnMs: 500,
          }),
        }),
      ),
    );
    expect(await screen.findByText("10.10.10.10:123 기준으로 시간 소스가 설정되었습니다.")).toBeInTheDocument();
  });

  test("runs sync check without changing form values", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => jsonResponse({ ...publicStatus, health: "warn", message: "수동/격리 모드입니다." }));
    vi.stubGlobal("fetch", fetcher);

    render(<TimeSyncSettingsView />);
    await screen.findByText("수동/격리 모드입니다.");

    await user.click(screen.getByRole("button", { name: "동기화 점검" }));

    await waitFor(() =>
      expect(fetcher).toHaveBeenLastCalledWith(
        "/api/ops/time/check",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  test("changes global motion mode from the operations settings screen", async () => {
    const user = userEvent.setup();
    const onMotionModeChange = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(publicStatus)));

    render(<TimeSyncSettingsView motionMode="reduced" onMotionModeChange={onMotionModeChange} />);
    await screen.findByText("pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.");

    await user.click(screen.getByRole("button", { name: "화면 효과" }));

    expect(screen.getByRole("radio", { name: /효과 줄임/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /효과 끄기/ }));

    expect(onMotionModeChange).toHaveBeenCalledWith("off");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
