import { describe, expect, test } from "vitest";
import { isGroupMember, isGroupMemberList } from "./groupMembers";

describe("group member contracts", () => {
  const member = { username: "operator-a", email: "operator@test", role: "operator", groupId: "co-a", active: true, securityVersion: 2 };

  test("accepts scoped member responses without credentials", () => {
    expect(isGroupMember(member)).toBe(true);
    expect(isGroupMemberList([member])).toBe(true);
    expect(JSON.stringify(member)).not.toContain("password");
  });

  test("rejects system administrator role from group member responses", () => {
    expect(isGroupMember({ ...member, role: "admin" })).toBe(false);
  });
});
