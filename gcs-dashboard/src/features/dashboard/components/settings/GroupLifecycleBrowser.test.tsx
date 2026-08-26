import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { GroupLifecycleBrowser } from "./GroupLifecycleBrowser";

vi.mock("@dashboard/groups/managedGroupApi", () => ({
  changeManagedGroupStatus: vi.fn(async () => ({})),
  updateManagedGroup: vi.fn(async () => ({})),
}));

describe("GroupLifecycleBrowser", () => {
  test("shows five groups per page and edits only the selected group", async () => {
    const user = userEvent.setup();
    const groups = Array.from({ length: 6 }, (_, index) => ({
      id: `group-${index + 1}`, name: `Group ${index + 1}`, type: "company" as const,
      parentId: null, status: "active" as const,
    }));
    render(<GroupLifecycleBrowser groups={groups} onChanged={vi.fn(async () => undefined)} onError={vi.fn()} />);

    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(5);
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Group 2/ }));
    expect(screen.getByLabelText("group-2 이름")).toHaveValue("Group 2");
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByLabelText("group-6 이름")).toHaveValue("Group 6");
  });
});
