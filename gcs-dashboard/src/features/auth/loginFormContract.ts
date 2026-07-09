import { z } from "zod";
import type { LoginRequest } from "./types";

export const LOGIN_FORM_ERROR_MESSAGES = Object.freeze({
  passwordRequired: "비밀번호를 입력해주세요.",
  usernameRequired: "아이디를 입력해주세요.",
});

export const loginFormSchema = z.object({
  username: z.string().trim().min(1, LOGIN_FORM_ERROR_MESSAGES.usernameRequired),
  password: z.string().min(1, LOGIN_FORM_ERROR_MESSAGES.passwordRequired),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export function toLoginRequest(values: LoginFormValues): LoginRequest {
  return {
    username: values.username,
    password: values.password,
  };
}
