import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { loginRequest } from "./authApi";
import {
  clearAuthSession,
  getStoredAccessToken,
  getStoredUser,
  storeAuthSession,
} from "./authStorage";
import type { AuthenticatedUser, LoginRequest } from "./types";

interface AuthContextValue {
  accessToken: string | null;
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() =>
    getStoredUser<AuthenticatedUser>(),
  );

  const logout = useCallback((): void => {
    clearAuthSession();
    setAccessToken(null);
    setCurrentUser(null);
  }, []);

  const login = useCallback(async (credentials: LoginRequest): Promise<void> => {
    const token = await loginRequest(credentials);
    const user = { username: token.username, role: token.role };
    storeAuthSession({
      accessToken: token.access_token,
      expiresAt: new Date(Date.now() + token.expires_in_minutes * 60_000).toISOString(),
      user,
    });
    setAccessToken(token.access_token);
    setCurrentUser(user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      currentUser,
      isAuthenticated: Boolean(accessToken),
      login,
      logout,
    }),
    [accessToken, currentUser, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
