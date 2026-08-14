import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@auth/AuthProvider";

export function useDashboardAuthNavigation() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const handleAuthFailure = useCallback((): void => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
  const handleLogout = useCallback((): void => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);
  return { currentUser, handleAuthFailure, handleLogout };
}
