export type ProvisioningTokenStatus = "active" | "exhausted" | "revoked" | "expired";

export interface IssueProvisioningTokenInput {
  groupId: string;
  label: string;
  ttlMinutes: number;
  maxUses: number;
}

export interface ProvisioningTokenIssue {
  tokenId: string;
  token: string;
  groupId: string;
  label: string;
  status: ProvisioningTokenStatus;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export type ProvisioningTokenRecord = Omit<ProvisioningTokenIssue, "token">;

export const DEFAULT_PROVISIONING_TOKEN_INPUT: IssueProvisioningTokenInput = Object.freeze({
  groupId: "co-a",
  label: "현장 장비 등록",
  ttlMinutes: 60,
  maxUses: 1,
});

export function isProvisioningTokenRecord(payload: unknown): payload is ProvisioningTokenRecord {
  const record = payload as ProvisioningTokenRecord;
  return Boolean(
    record
      && typeof record.tokenId === "string"
      && typeof record.groupId === "string"
      && typeof record.label === "string"
      && isProvisioningTokenStatus(record.status)
      && typeof record.maxUses === "number"
      && typeof record.usedCount === "number"
      && typeof record.expiresAt === "string"
      && typeof record.createdBy === "string"
      && typeof record.createdAt === "string",
  );
}

export function isProvisioningTokenIssue(payload: unknown): payload is ProvisioningTokenIssue {
  const issue = payload as ProvisioningTokenIssue;
  return isProvisioningTokenRecord(issue) && typeof issue.token === "string";
}

export function isProvisioningTokenRecordList(payload: unknown): payload is ProvisioningTokenRecord[] {
  return Array.isArray(payload) && payload.every(isProvisioningTokenRecord);
}

function isProvisioningTokenStatus(status: unknown): status is ProvisioningTokenStatus {
  return status === "active" || status === "exhausted" || status === "revoked" || status === "expired";
}
