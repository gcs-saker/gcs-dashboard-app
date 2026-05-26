export type UserRole = "viewer" | "operator" | "admin";

export interface LoginRequest {
  username: string;
  password: string;
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
