import { Link } from "react-router-dom";

import { FormField } from "@ui/FormField";
import type { SignupFormController } from "./useSignupForm";

interface SignupFormViewProps {
  form: SignupFormController;
}

export function SignupFormView({ form }: SignupFormViewProps) {
  return (
    <main className="auth-page">
      <form className="auth-login auth-login--wide" onSubmit={form.handleSubmit}>
        <div className="auth-login__header">
          <p>GCS-SAKER</p>
          <h1>회원가입</h1>
        </div>

        <SignupTextField
          autoComplete="username"
          label="아이디"
          minLength={3}
          name="username"
          onChange={form.setUsername}
          type="text"
          value={form.username}
        />
        <SignupTextField
          autoComplete="email"
          label="이메일"
          name="email"
          onChange={form.setEmail}
          type="email"
          value={form.email}
        />
        <SignupTextField
          autoComplete="new-password"
          label="비밀번호"
          minLength={8}
          name="password"
          onChange={form.setPassword}
          type="password"
          value={form.password}
        />
        <SignupTextField
          autoComplete="new-password"
          label="비밀번호 확인"
          minLength={8}
          name="confirmPassword"
          onChange={form.setConfirmPassword}
          type="password"
          value={form.confirmPassword}
        />
        <SignupTextField
          autoComplete="off"
          label="초대 코드"
          name="inviteCode"
          onChange={form.setInviteCode}
          type="text"
          value={form.inviteCode}
        />
        {form.errorMessage ? <p className="auth-login__error">{form.errorMessage}</p> : null}
        <button disabled={form.isSubmitting} type="submit">
          {form.isSubmitting ? "등록 중" : "가입"}
        </button>
        <p className="auth-login__footer">
          <Link to="/login">로그인으로 돌아가기</Link>
        </p>
      </form>
    </main>
  );
}

interface SignupTextFieldProps {
  autoComplete: string;
  label: string;
  minLength?: number;
  name: string;
  onChange: (value: string) => void;
  type: "email" | "password" | "text";
  value: string;
}

function SignupTextField({
  autoComplete,
  label,
  minLength,
  name,
  onChange,
  type,
  value,
}: SignupTextFieldProps) {
  return (
    <FormField label={label}>
      <input
        autoComplete={autoComplete}
        minLength={minLength}
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
    </FormField>
  );
}
