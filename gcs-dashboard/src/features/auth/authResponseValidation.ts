import { z } from "zod";
import type { AuthenticatedUser, SignupResponse, TokenResponse } from "./types";

const userRoleSchema = z.enum(["viewer", "operator", "group_admin", "admin"]);
const capabilitiesSchema = z.object({
  canView: z.boolean(),
  canControl: z.boolean(),
  canManage: z.boolean(),
  canSendTalkback: z.boolean(),
  canPublish: z.boolean(),
  canManageMembers: z.boolean(),
  canManageDevices: z.boolean(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
  expires_in_minutes: z.number().positive(),
  username: z.string().min(1),
  role: userRoleSchema,
  group_id: z.string().min(1),
  securityVersion: z.number().int().nonnegative(),
  capabilities: capabilitiesSchema,
});

const signupResponseSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  email: z.string().email(),
  company_id: z.number().int().positive(),
  role: userRoleSchema,
});

const authenticatedUserSchema = z.object({
  username: z.string().min(1),
  role: userRoleSchema,
  groupId: z.string().min(1),
  securityVersion: z.number().int().nonnegative(),
  capabilities: capabilitiesSchema,
});

export function parseTokenResponse(payload: unknown): TokenResponse {
  return tokenResponseSchema.parse(payload);
}

export function parseSignupResponse(payload: unknown): SignupResponse {
  return signupResponseSchema.parse(payload);
}

export function parseAuthenticatedUser(payload: unknown): AuthenticatedUser {
  return authenticatedUserSchema.parse(payload);
}

export function safeParseAuthenticatedUser(payload: unknown): AuthenticatedUser | null {
  const result = authenticatedUserSchema.safeParse(payload);
  return result.success ? result.data : null;
}
