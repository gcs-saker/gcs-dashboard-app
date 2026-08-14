import { describe, expect, test } from "vitest";
import { DEFAULT_SIGNUP_TOKEN_INPUT, isSignupTokenRecord } from "@dashboard/devices/signupTokens";

const record = {
  tokenId: "token-1",
  companyId: 1,
  groupId: "co-a",
  role: "operator",
  label: "mobile publisher",
  status: "active",
  maxUses: 1,
  usedCount: 0,
  expiresAt: "2026-08-14T00:00:00Z",
  createdBy: "admin01",
  createdAt: "2026-08-13T00:00:00Z",
};

describe("signup token contracts", () => {
  test("uses viewer as the least-privilege default", () => {
    expect(DEFAULT_SIGNUP_TOKEN_INPUT.role).toBe("viewer");
  });

  test("accepts assignable roles and rejects admin", () => {
    expect(isSignupTokenRecord(record)).toBe(true);
    expect(isSignupTokenRecord({ ...record, role: "viewer" })).toBe(true);
    expect(isSignupTokenRecord({ ...record, role: "admin" })).toBe(false);
  });
});
