import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { OrganizationAccessManagement } from "./OrganizationAccessManagement";

const fetchManagedGroups = vi.fn();
const fetchGroupMembers = vi.fn();
const replaceGroupAdministrator = vi.fn();
const updateGroupMember = vi.fn();

vi.mock("@dashboard/groups/managedGroupApi", () => ({
  fetchManagedGroups: (...args: unknown[]) => fetchManagedGroups(...args),
  createManagedGroup: vi.fn(), changeManagedGroupStatus: vi.fn(), updateManagedGroup: vi.fn(),
}));
vi.mock("@dashboard/groups/groupMemberApi", () => ({
  fetchGroupMembers: (...args: unknown[]) => fetchGroupMembers(...args),
  replaceGroupAdministrator: (...args: unknown[]) => replaceGroupAdministrator(...args),
  updateGroupMember: (...args: unknown[]) => updateGroupMember(...args),
}));
vi.mock("@dashboard/devices/signupTokenApi", () => ({ issueSignupToken: vi.fn() }));

describe("OrganizationAccessManagement", () => {
  beforeEach(() => {
    fetchManagedGroups.mockReset().mockResolvedValue([
      { id: "bn-1", name: "1 Battalion", type: "battalion", parentId: null, status: "active" },
      { id: "co-b", name: "B Company", type: "company", parentId: "bn-1", status: "inactive" },
    ]);
    fetchGroupMembers.mockReset().mockImplementation(async (groupId: string) => groupId === "co-b" ? [
      { username: "operator-b", email: "operator-b@example.test", role: "operator", groupId: "co-b", active: true, securityVersion: 1 },
    ] : []);
    replaceGroupAdministrator.mockReset().mockResolvedValue({});
    updateGroupMember.mockReset().mockResolvedValue({});
  });

  test("uses one hierarchy selection for overview and member management", async () => {
    const user = userEvent.setup();
    render(<OrganizationAccessManagement />);
    const tree = await screen.findByRole("tree");

    await user.click(within(tree).getByRole("treeitem", { name: /B Company/ }));
    expect(await screen.findByText("최초 관리자 필요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "활성화" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("관리자 후보"), "operator-b");
    await user.click(screen.getByRole("button", { name: "관리자로 지정" }));
    expect(replaceGroupAdministrator).toHaveBeenCalledWith("co-b", "operator-b");
    await user.click(screen.getByRole("button", { name: "회원" }));

    expect(await screen.findByLabelText("B Company 회원 관리")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /operator-b/ })).toBeInTheDocument();
    expect(fetchGroupMembers).toHaveBeenCalledWith("co-b");
  });

  test("opens group creation with the selected active parent", async () => {
    const user = userEvent.setup();
    render(<OrganizationAccessManagement />);
    await screen.findByRole("tree");
    await user.click(screen.getByRole("button", { name: "+ 그룹" }));

    expect(screen.getByRole("form", { name: "그룹 생성" })).toBeInTheDocument();
    expect(screen.getByLabelText("상위 그룹")).toHaveValue("bn-1");
  });
});
