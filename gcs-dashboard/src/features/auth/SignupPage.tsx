import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthApiError, signupRequest } from "./authApi";
import type { UserRole } from "./types";
import "./LoginPage.css";

const DEFAULT_ROLE: UserRole = "viewer";

function signupErrorMessage(error: unknown): string {
  if (!(error instanceof AuthApiError)) {
    return "회원가입 서버 상태를 확인해주세요.";
  }

  if (error.message === "Username already registered") {
    return "이미 등록된 아이디입니다.";
  }

  if (error.message === "Email already registered") {
    return "이미 등록된 이메일입니다.";
  }

  if (error.message === "Invalid invite code Input") {
    return "초대 코드가 올바르지 않습니다.";
  }

  return "회원가입 요청을 처리하지 못했습니다.";
}

export function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState<UserRole>(DEFAULT_ROLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsSubmitting(true);

    try {
      const createdUser = await signupRequest({
        username,
        email,
        password,
        inviteCode,
        role,
      });
      navigate(`/login?registered=1&username=${encodeURIComponent(createdUser.username)}`, {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(signupErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-login auth-login--wide" onSubmit={handleSubmit}>
        <div className="auth-login__header">
          <p>GCS-SAKER</p>
          <h1>회원가입</h1>
        </div>

        <label>
          <span>아이디</span>
          <input
            autoComplete="username"
            minLength={3}
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label>
          <span>이메일</span>
          <input
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label>
          <span>비밀번호</span>
          <input
            autoComplete="new-password"
            minLength={8}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <label>
          <span>비밀번호 확인</span>
          <input
            autoComplete="new-password"
            minLength={8}
            name="confirmPassword"
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            type="password"
            value={confirmPassword}
          />
        </label>

        <label>
          <span>초대 코드</span>
          <input
            autoComplete="off"
            name="inviteCode"
            onChange={(event) => setInviteCode(event.target.value)}
            required
            type="text"
            value={inviteCode}
          />
        </label>

        <label>
          <span>권한</span>
          <select
            name="role"
            onChange={(event) => setRole(event.target.value as UserRole)}
            value={role}
          >
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
          </select>
        </label>

        {errorMessage ? <p className="auth-login__error">{errorMessage}</p> : null}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "등록 중" : "가입"}
        </button>

        <p className="auth-login__footer">
          <Link to="/login">로그인으로 돌아가기</Link>
        </p>
      </form>
    </main>
  );
}
