export type UserRole = "viewer" | "operator" | "group_admin" | "admin";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
}

export interface SignupResponse {
  id: number;
  username: string;
  email: string;
  company_id: number;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in_minutes: number;
  username: string;
  role: UserRole;
  group_id: string;
  securityVersion: number;
  capabilities: AuthCapabilities;
}

export interface AuthCapabilities {
  canView: boolean;
  canControl: boolean;
  canManage: boolean;
  canSendTalkback: boolean;
  canPublish: boolean;
  canManageMembers: boolean;
  canManageDevices: boolean;
}

export interface AuthenticatedUser {
  username: string;
  role: UserRole;
  groupId: string;
  securityVersion: number;
  capabilities: AuthCapabilities;
}
