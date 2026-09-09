import type { UseFormRegister } from "react-hook-form";
import type { LoginFormValues } from "./loginFormContract";

interface MfaLoginFieldProps {
  register: UseFormRegister<LoginFormValues>;
}

export function MfaLoginField({ register }: MfaLoginFieldProps) {
  return (
    <label>
      <span>관리자 MFA 또는 복구 코드</span>
      <input
        autoComplete="one-time-code"
        inputMode="text"
        spellCheck={false}
        type="password"
        {...register("mfaCode")}
      />
    </label>
  );
}
