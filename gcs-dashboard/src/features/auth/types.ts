export type UserRole = "viewer" | "operator" | "admin";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
  role: UserRole;
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
}

export interface AuthenticatedUser {
  username: string;
  role: UserRole;
}
