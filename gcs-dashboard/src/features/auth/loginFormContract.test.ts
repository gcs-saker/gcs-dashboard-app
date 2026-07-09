import { describe, expect, test } from "vitest";
import {
  LOGIN_FORM_ERROR_MESSAGES,
  loginFormSchema,
  toLoginRequest,
} from "./loginFormContract";

describe("login form contract", () => {
  test("maps valid form values to the login DTO", () => {
    const values = loginFormSchema.parse({
      password: " password-with-space ",
      username: " operator01 ",
    });

    expect(toLoginRequest(values)).toEqual({
      password: " password-with-space ",
      username: "operator01",
    });
  });

  test("rejects missing username and password with stable messages", () => {
    const result = loginFormSchema.safeParse({
      password: "",
      username: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        LOGIN_FORM_ERROR_MESSAGES.usernameRequired,
        LOGIN_FORM_ERROR_MESSAGES.passwordRequired,
      ]);
    }
  });
});
