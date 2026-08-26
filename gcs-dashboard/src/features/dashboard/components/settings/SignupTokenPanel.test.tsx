import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SignupTokenPanel } from "./SignupTokenPanel";

const mocks = vi.hoisted(() => ({
  issue: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
  fetchGroups: vi.fn(async () => [
    { id: "co-a", name: "A Company", type: "company" as const, parentId: null, status: "active" as const },
    { id: "co-b", name: "B Company", type: "company" as const, parentId: null, status: "active" as const },
  ]),
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    currentUser: {
      username: "admin01", role: "admin", groupId: "root", securityVersion: 1,
      capabilities: { canManageMembers: true },
    },
  }),
}));
vi.mock("@dashboard/groups/managedGroupApi", () => ({ fetchManagedGroups: mocks.fetchGroups }));
vi.mock("@dashboard/hooks/devices/useSignupTokens", () => ({
  useSignupTokens: () => ({
    records: [], issuedToken: null, isLoading: false, isIssuing: false, errorMessage: null,
    refresh: mocks.refresh, issue: mocks.issue, clear: vi.fn(),
  }),
}));

describe("SignupTokenPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  test("issues tokens only for an existing managed group", async () => {
    const user = userEvent.setup();
    render(<SignupTokenPanel />);

    const groupSelect = await screen.findByRole("combobox", { name: "그룹" });
    expect(screen.queryByRole("textbox", { name: "그룹 ID" })).not.toBeInTheDocument();
    await user.selectOptions(groupSelect, "co-b");
    await user.click(screen.getByRole("button", { name: "회원가입 토큰 발급" }));

    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1, groupId: "co-b" }));
    expect(screen.getByRole("button", { name: "새로고침" })).toHaveClass("settings-refresh-button");
  });
});
