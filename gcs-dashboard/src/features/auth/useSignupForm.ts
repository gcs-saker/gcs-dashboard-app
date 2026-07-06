import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { signupRequest } from "./authApi";
import {
  passwordMismatchMessage,
  signupErrorMessage,
} from "./signupPresentation";
import type { UserRole } from "./types";

const DEFAULT_ROLE: UserRole = "viewer";

export interface SignupFormState {
  confirmPassword: string;
  email: string;
  errorMessage: string | null;
  inviteCode: string;
  isSubmitting: boolean;
  password: string;
  role: UserRole;
  username: string;
}

export interface SignupFormController extends SignupFormState {
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setConfirmPassword: (value: string) => void;
  setEmail: (value: string) => void;
  setInviteCode: (value: string) => void;
  setPassword: (value: string) => void;
  setRole: (value: UserRole) => void;
  setUsername: (value: string) => void;
}

export function useSignupForm(): SignupFormController {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [role, setRole] = useState<UserRole>(DEFAULT_ROLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage(passwordMismatchMessage());
      return;
    }

    setIsSubmitting(true);
    try {
      const createdUser = await signupRequest({ username, email, password, inviteCode, role });
      navigate(`/login?registered=1&username=${encodeURIComponent(createdUser.username)}`, {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(signupErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [confirmPassword, email, inviteCode, navigate, password, role, username]);

  return {
    confirmPassword,
    email,
    errorMessage,
    handleSubmit,
    inviteCode,
    isSubmitting,
    password,
    role,
    setConfirmPassword,
    setEmail,
    setInviteCode,
    setPassword,
    setRole,
    setUsername,
    username,
  };
}
