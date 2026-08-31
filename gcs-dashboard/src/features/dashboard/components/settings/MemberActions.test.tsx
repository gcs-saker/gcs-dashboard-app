import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { GroupMember } from "@dashboard/groups/groupMembers";
import { MemberActions } from "./MemberActions";

const member: GroupMember = {
  username: "operator01", email: "operator@example.test", role: "operator",
  groupId: "co-a", active: true, securityVersion: 1,
};

describe("MemberActions", () => {
  test("runs member lifecycle actions", () => {
    const onAppoint = vi.fn(async () => undefined);
    const onUpdate = vi.fn(async () => undefined);
    render(<MemberActions canAppoint member={member} onAppoint={onAppoint} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "역할 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "비활성화" }));
    fireEvent.change(screen.getByLabelText("operator01 임시 비밀번호"), { target: { value: "temporary-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "관리자 지정" }));

    expect(onUpdate).toHaveBeenCalledWith(member, { role: "viewer" });
    expect(onUpdate).toHaveBeenCalledWith(member, { active: false });
    expect(onUpdate).toHaveBeenCalledWith(member, { password: "temporary-1234" });
    expect(onAppoint).toHaveBeenCalledWith("operator01");
  });
});
