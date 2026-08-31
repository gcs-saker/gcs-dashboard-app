import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

const { logoutRequest, refreshSessionOnce } = vi.hoisted(() => ({
  logoutRequest: vi.fn(async () => undefined),
  refreshSessionOnce: vi.fn(async () => { throw new Error("no renewal session"); }),
}));

vi.mock("./authApi", () => ({
  loginRequest: vi.fn(),
  logoutRequest,
  persistTokenResponse: vi.fn(),
  refreshSessionOnce,
}));
vi.mock("./authStorage", () => ({
  clearAuthSession: vi.fn(),
  getStoredAccessToken: () => "access-token",
  getStoredUser: () => ({
    username: "operator-a", role: "operator", groupId: "co-a", securityVersion: 1,
    capabilities: {
      canView: true, canControl: true, canManage: false, canSendTalkback: true,
      canPublish: true, canManageMembers: false, canManageDevices: false,
    },
  }),
}));

function LogoutProbe() {
  const { logout } = useAuth();
  return <button type="button" onClick={logout}>로그아웃</button>;
}

describe("AuthProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  test("clears all session-scoped client state before requesting logout", async () => {
    const onSessionCleared = vi.fn();
    render(<AuthProvider onSessionCleared={onSessionCleared}><LogoutProbe /></AuthProvider>);

    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(onSessionCleared).toHaveBeenCalledOnce();
    expect(logoutRequest).toHaveBeenCalledOnce();
    expect(onSessionCleared.mock.invocationCallOrder[0]).toBeLessThan(logoutRequest.mock.invocationCallOrder[0]);
  });
});
