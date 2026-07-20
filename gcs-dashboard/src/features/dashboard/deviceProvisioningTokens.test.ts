import { describe, expect, test } from "vitest";
import {
  DEFAULT_PROVISIONING_TOKEN_INPUT,
  isProvisioningTokenIssue,
  isProvisioningTokenRecord,
  isProvisioningTokenRecordList,
} from "./deviceProvisioningTokens";

describe("deviceProvisioningTokens", () => {
  test("keeps default issue input conservative", () => {
    expect(DEFAULT_PROVISIONING_TOKEN_INPUT).toMatchObject({
      groupId: "co-a",
      ttlMinutes: 60,
      maxUses: 1,
    });
  });

  test("validates issue payload separately from record payload", () => {
    const record = {
      tokenId: "token-001",
      groupId: "co-a",
      label: "현장 장비 등록",
      status: "active",
      maxUses: 1,
      usedCount: 0,
      expiresAt: "2026-07-20T01:00:00Z",
      createdBy: "admin01",
      createdAt: "2026-07-20T00:00:00Z",
    };

    expect(isProvisioningTokenRecord(record)).toBe(true);
    expect(isProvisioningTokenIssue(record)).toBe(false);
    expect(isProvisioningTokenIssue({ ...record, token: "gcs_boot_secret" })).toBe(true);
    expect(isProvisioningTokenRecordList([record])).toBe(true);
  });
});
