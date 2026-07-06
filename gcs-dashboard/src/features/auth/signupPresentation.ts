import { AuthApiError } from "./authErrors";

const SIGNUP_ERROR_MESSAGES = Object.freeze({
  duplicateUsername: "이미 등록된 아이디입니다.",
  duplicateEmail: "이미 등록된 이메일입니다.",
  invalidInvite: "초대 코드가 올바르지 않습니다.",
  passwordMismatch: "비밀번호 확인이 일치하지 않습니다.",
  serverUnavailable: "회원가입 서버 상태를 확인해주세요.",
  unknown: "회원가입 요청을 처리하지 못했습니다.",
});

const SIGNUP_API_ERROR_MESSAGES = Object.freeze({
  duplicateUsername: "Username already registered",
  duplicateEmail: "Email already registered",
  invalidInvite: "Invalid invite code Input",
});

const SIGNUP_API_ERROR_MESSAGE_MAP = new Map<string, string>([
  [SIGNUP_API_ERROR_MESSAGES.duplicateUsername, SIGNUP_ERROR_MESSAGES.duplicateUsername],
  [SIGNUP_API_ERROR_MESSAGES.duplicateEmail, SIGNUP_ERROR_MESSAGES.duplicateEmail],
  [SIGNUP_API_ERROR_MESSAGES.invalidInvite, SIGNUP_ERROR_MESSAGES.invalidInvite],
]);

export function signupErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError)) {
    return SIGNUP_ERROR_MESSAGES.serverUnavailable;
  }

  return SIGNUP_API_ERROR_MESSAGE_MAP.get(error.message) ?? SIGNUP_ERROR_MESSAGES.unknown;
}

export function passwordMismatchMessage(): string {
  return SIGNUP_ERROR_MESSAGES.passwordMismatch;
}
