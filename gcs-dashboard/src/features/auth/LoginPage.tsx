import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthApiError } from "./authApi";
import { useAuth } from "./AuthProvider";
import "./LoginPage.css";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await login({ username, password });
      const params = new URLSearchParams(location.search);
      navigate(safeRedirectPath(params.get("redirect")), { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        setErrorMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setErrorMessage("인증 서버 상태를 확인해주세요.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-login" onSubmit={handleSubmit}>
        <div className="auth-login__header">
          <p>GCS-SAKER</p>
          <h1>대시보드 로그인</h1>
        </div>

        <label>
          <span>아이디</span>
          <input
            autoComplete="username"
            name="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label>
          <span>비밀번호</span>
          <input
            autoComplete="current-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        {errorMessage ? <p className="auth-login__error">{errorMessage}</p> : null}

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "확인 중" : "접속"}
        </button>
      </form>
    </main>
  );
}
