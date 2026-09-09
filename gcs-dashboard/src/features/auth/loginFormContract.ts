import { z } from "zod";
import type { LoginRequest } from "./types";

export const LOGIN_FORM_ERROR_MESSAGES = Object.freeze({
  passwordRequired: "비밀번호를 입력해주세요.",
  usernameRequired: "아이디를 입력해주세요.",
});

export const loginFormSchema = z.object({
  username: z.string().trim().min(1, LOGIN_FORM_ERROR_MESSAGES.usernameRequired),
  password: z.string().min(1, LOGIN_FORM_ERROR_MESSAGES.passwordRequired),
  mfaCode: z.string().trim().max(128).optional(),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export function toLoginRequest(values: LoginFormValues): LoginRequest {
  const request: LoginRequest = {
    username: values.username,
    password: values.password,
  };
  if (values.mfaCode) request.mfaCode = values.mfaCode;
  return request;
}
