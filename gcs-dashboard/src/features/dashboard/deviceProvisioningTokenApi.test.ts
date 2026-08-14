import { describe, expect, test, vi } from "vitest";
import { fetchProvisioningTokens, issueProvisioningToken } from "./deviceProvisioningTokenApi";

describe("deviceProvisioningTokenApi", () => {
  test("fetches provisioning token records without raw token field", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          tokenId: "token-001",
          groupId: "co-a",
          label: "현장 장비 등록",
          status: "active",
          maxUses: 1,
          usedCount: 0,
          expiresAt: "2026-07-20T01:00:00Z",
          createdBy: "admin01",
          createdAt: "2026-07-20T00:00:00Z",
        },
      ]),
    );

    const records = await fetchProvisioningTokens(fetcher);

    expect(records).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/auth-policy/api/v1/provisioning-tokens",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(records[0]).not.toHaveProperty("token");
  });

  test("issues provisioning token through admin API", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        tokenId: "token-001",
        token: "gcs_boot_secret",
        groupId: "co-a",
        label: "현장 장비 등록",
        status: "active",
        maxUses: 1,
        usedCount: 0,
        expiresAt: "2026-07-20T01:00:00Z",
        createdBy: "admin01",
        createdAt: "2026-07-20T00:00:00Z",
      }),
    );

    const issue = await issueProvisioningToken({
      groupId: "co-a",
      label: "현장 장비 등록",
      ttlMinutes: 60,
      maxUses: 1,
    }, fetcher);

    expect(issue.token).toBe("gcs_boot_secret");
    expect(fetcher).toHaveBeenCalledWith(
      "/auth-policy/api/v1/provisioning-tokens",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
