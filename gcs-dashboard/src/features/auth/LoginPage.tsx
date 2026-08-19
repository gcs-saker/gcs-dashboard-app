import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type FieldErrors, type UseFormRegister } from "react-hook-form";
import type { FormEventHandler } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthApiError } from "./authApi";
import { useAuth } from "./AuthProvider";
import { loginFormSchema, toLoginRequest, type LoginFormValues } from "./loginFormContract";
import "./LoginPage.css";

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const registeredUsername = params.get("registered") === "1" ? params.get("username") : null;
  const redirectPath = safeRedirectPath(params.get("redirect"));
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    defaultValues: {
      password: "",
      username: "",
    },
    resolver: zodResolver(loginFormSchema),
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectPath]);

  const submitLogin = handleSubmit(async (values): Promise<void> => {
    setErrorMessage(null);

    try {
      await login(toLoginRequest(values));
      navigate(redirectPath, { replace: true });
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        setErrorMessage("아이디 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setErrorMessage("인증 서버 상태를 확인해주세요.");
      }
    }
  });

  return <LoginFormView {...{ errorMessage, errors, isSubmitting, register, registeredUsername, submitLogin }} />;
}

interface LoginFormViewProps {
  errorMessage: string | null;
  errors: FieldErrors<LoginFormValues>;
  isSubmitting: boolean;
  register: UseFormRegister<LoginFormValues>;
  registeredUsername: string | null;
  submitLogin: FormEventHandler<HTMLFormElement>;
}

function LoginFormView(props: LoginFormViewProps) {
  return (
    <main className="auth-page">
      <form className="auth-login" noValidate onSubmit={props.submitLogin}>
        <div className="auth-login__header">
          <p>GCS-SAKER</p>
          <h1>대시보드 로그인</h1>
        </div>

        {props.registeredUsername ? (
          <p className="auth-login__success">
            {props.registeredUsername} 계정이 등록되었습니다. 로그인해주세요.
          </p>
        ) : null}
        <LoginFields errors={props.errors} register={props.register} />
        {props.errorMessage ? <p className="auth-login__error">{props.errorMessage}</p> : null}
        <button disabled={props.isSubmitting} type="submit">{props.isSubmitting ? "확인 중" : "접속"}</button>
        <p className="auth-login__footer"><Link to="/signup">회원가입</Link></p>
      </form>
    </main>
  );
}

function LoginFields({ errors, register }: Pick<LoginFormViewProps, "errors" | "register">) {
  return <>
        <label>
          <span>아이디</span>
          <input
            aria-describedby={errors.username ? "login-username-error" : undefined}
            aria-invalid={Boolean(errors.username)}
            autoComplete="username"
            type="text"
            {...register("username")}
          />
        </label>
        {errors.username?.message ? (
          <p className="auth-login__error" id="login-username-error" role="alert">
            {errors.username.message}
          </p>
        ) : null}

        <label>
          <span>비밀번호</span>
          <input
            aria-describedby={errors.password ? "login-password-error" : undefined}
            aria-invalid={Boolean(errors.password)}
            autoComplete="current-password"
            type="password"
            {...register("password")}
          />
        </label>
        {errors.password?.message ? (
          <p className="auth-login__error" id="login-password-error" role="alert">
            {errors.password.message}
          </p>
        ) : null}

  </>;
}
