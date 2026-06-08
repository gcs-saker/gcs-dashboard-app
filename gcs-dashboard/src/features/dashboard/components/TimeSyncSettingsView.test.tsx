import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TimeSyncSettingsView } from "./TimeSyncSettingsView";

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
  vi.unstubAllGlobals();
});

describe("TimeSyncSettingsView", () => {
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
    expect(await screen.findByText("pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.")).toBeInTheDocument();

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
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
