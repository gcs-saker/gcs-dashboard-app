import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { clearAuthSession, storeAuthSession } from "@/features/auth/authStorage";
import type { UserRole } from "@/features/auth/types";
import { DeviceApprovalPanel } from "./DeviceApprovalPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  clearAuthSession();
});

describe("DeviceApprovalPanel", () => {
  test("admin sees pending devices and approves one", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(device("active"));
      }
      return jsonResponse([device("pending"), device("active")]);
    });
    vi.stubGlobal("fetch", fetcher);

    renderPanel("admin");

    expect(await screen.findByText("Daegu Drone 01")).toBeInTheDocument();
    expect(screen.getByText("승인 대기 장비 1대")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "승인" }));

    await waitFor(() => {
      expect(screen.getByText("승인 대기중인 장비가 없습니다.")).toBeInTheDocument();
    });
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/auth-policy/admin/devices/device-001/activate");
  });

  test("viewer can see pending devices but cannot approve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([device("pending")])));

    renderPanel("viewer");

    expect(await screen.findByText("Daegu Drone 01")).toBeInTheDocument();
    expect(screen.getByText("관리자 계정으로 로그인해야 장비를 승인할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
  });
});

function renderPanel(role: UserRole) {
  storeAuthSession({
    accessToken: "test-access-token",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    user: { role, username: `${role}-user` },
  });
  render(
    <AuthProvider>
      <DeviceApprovalPanel />
    </AuthProvider>,
  );
}

function device(status: string) {
  return {
    deviceUuid: "device-001",
    deviceType: "drone",
    displayName: "Daegu Drone 01",
    groupId: "co-a",
    sensors: [],
    status,
    streamPaths: [],
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  } as Response;
}
