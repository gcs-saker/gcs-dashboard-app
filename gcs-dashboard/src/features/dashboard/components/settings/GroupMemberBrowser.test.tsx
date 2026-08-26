import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { GroupMember } from "@dashboard/groups/groupMembers";
import { GroupMemberBrowser } from "./GroupMemberBrowser";

const members: GroupMember[] = Array.from({ length: 6 }, (_, index) => ({
  username: `operator-${index + 1}`, email: `operator-${index + 1}@example.test`, role: "operator",
  groupId: "co-a", active: true, securityVersion: 1,
}));

describe("GroupMemberBrowser", () => {
  test("pages members and renders actions only for the selected member", async () => {
    const user = userEvent.setup();
    render(<GroupMemberBrowser canAppoint members={members} onAppoint={vi.fn(async () => undefined)}
      onUpdate={vi.fn(async () => undefined)} />);
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(5);
    await user.click(within(listbox).getByRole("option", { name: /operator-2/ }));
    expect(screen.getByLabelText("operator-2 임시 비밀번호")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByLabelText("operator-6 임시 비밀번호")).toBeInTheDocument();
  });
});
