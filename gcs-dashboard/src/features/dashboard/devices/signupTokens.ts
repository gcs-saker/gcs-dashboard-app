export type SignupTokenStatus = "active" | "exhausted" | "revoked" | "expired";
export type SignupTokenRole = "viewer" | "operator";

export interface IssueSignupTokenInput {
  companyId: number;
  groupId: string;
  role: SignupTokenRole;
  label: string;
  ttlMinutes: number;
  maxUses: number;
}

export interface SignupTokenRecord {
  tokenId: string;
  companyId: number;
  groupId: string;
  role: SignupTokenRole;
  label: string;
  status: SignupTokenStatus;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface SignupTokenIssue {
  token: string;
  record: SignupTokenRecord;
}

export const DEFAULT_SIGNUP_TOKEN_INPUT: IssueSignupTokenInput = {
  companyId: 1,
  groupId: "co-a",
  role: "viewer",
  label: "신규 회원 초대",
  ttlMinutes: 1440,
  maxUses: 1,
};

export function isSignupTokenRecord(value: unknown): value is SignupTokenRecord {
  const record = value as SignupTokenRecord;
  return Boolean(record
    && typeof record.tokenId === "string"
    && typeof record.companyId === "number"
    && typeof record.groupId === "string"
    && ["viewer", "operator"].includes(record.role)
    && typeof record.label === "string"
    && ["active", "exhausted", "revoked", "expired"].includes(record.status)
    && typeof record.maxUses === "number"
    && typeof record.usedCount === "number"
    && typeof record.expiresAt === "string");
}

export const isSignupTokenRecordList = (value: unknown): value is SignupTokenRecord[] =>
  Array.isArray(value) && value.every(isSignupTokenRecord);

export const isSignupTokenIssue = (value: unknown): value is SignupTokenIssue => {
  const issue = value as SignupTokenIssue;
  return Boolean(issue && typeof issue.token === "string" && isSignupTokenRecord(issue.record));
};
