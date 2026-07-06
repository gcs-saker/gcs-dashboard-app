import { describe, expect, test } from "vitest";
import { AuthApiError } from "./authErrors";
import { passwordMismatchMessage, signupErrorMessage } from "./signupPresentation";

describe("signupPresentation", () => {
  test.each([
    ["Username already registered", "이미 등록된 아이디입니다."],
    ["Email already registered", "이미 등록된 이메일입니다."],
    ["Invalid invite code Input", "초대 코드가 올바르지 않습니다."],
  ])("maps backend detail '%s' to a localized signup message", (detail, expected) => {
    expect(signupErrorMessage(new AuthApiError(400, detail))).toBe(expected);
  });

  test("returns a server unavailable message for non API errors", () => {
    expect(signupErrorMessage(new Error("network failed"))).toBe("회원가입 서버 상태를 확인해주세요.");
  });

  test("returns a generic message for unknown API detail", () => {
    expect(signupErrorMessage(new AuthApiError(500, "unexpected backend detail"))).toBe("회원가입 요청을 처리하지 못했습니다.");
  });

  test("exposes password mismatch copy from one presentation contract", () => {
    expect(passwordMismatchMessage()).toBe("비밀번호 확인이 일치하지 않습니다.");
  });
});
