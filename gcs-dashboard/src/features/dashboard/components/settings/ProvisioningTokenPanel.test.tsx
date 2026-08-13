import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { clearAuthSession, storeAuthSession } from "@/features/auth/authStorage";
import type { UserRole } from "@/features/auth/types";
import { ProvisioningTokenPanel } from "./ProvisioningTokenPanel";

afterEach(() => {
  vi.unstubAllGlobals();
  clearAuthSession();
});

describe("ProvisioningTokenPanel", () => {
  test("admin issues bootstrap token and sees raw token only in issue result", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(provisioningIssue());
      }
      return jsonResponse([provisioningRecord()]);
    });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText },
    });

    renderPanel("admin");

    expect(await screen.findByText("Daegu bootstrap")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "토큰 발급" }));

    expect(await screen.findByText("gcs_boot_once")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "발급된 provisioning token 복사" }));
    expect(writeText).toHaveBeenCalledWith("gcs_boot_once");
    expect(await screen.findByText("복사됨")).toBeInTheDocument();

    const postRequest = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postRequest?.[0]).toBe("/auth-policy/admin/provisioning-tokens");
    expect(JSON.parse(String(postRequest?.[1]?.body))).toEqual({
      groupId: "co-a",
      label: "현장 장비 등록",
      maxUses: 1,
      ttlMinutes: 60,
    });

    await user.click(screen.getByRole("button", { name: "확인 후 숨기기" }));
    expect(screen.queryByText("gcs_boot_once")).not.toBeInTheDocument();
  });

  test("viewer can inspect records but cannot issue bootstrap token", async () => {
    const fetcher = vi.fn(async () => jsonResponse([provisioningRecord()]));
    vi.stubGlobal("fetch", fetcher);

    renderPanel("viewer");

    expect(await screen.findByText("Daegu bootstrap")).toBeInTheDocument();
    expect(screen.getByText("관리자 계정으로 로그인해야 발급할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "토큰 발급" })).toBeDisabled();
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
      <ProvisioningTokenPanel />
    </AuthProvider>,
  );
}

function provisioningRecord() {
  return {
    createdAt: "2026-07-20T01:00:00Z",
    createdBy: "admin-user",
    expiresAt: "2026-07-20T02:00:00Z",
    groupId: "co-a",
    label: "Daegu bootstrap",
    maxUses: 1,
    status: "active",
    tokenId: "token-001",
    usedCount: 0,
  };
}

function provisioningIssue() {
  return {
    ...provisioningRecord(),
    label: "현장 장비 등록",
    token: "gcs_boot_once",
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  } as Response;
}
