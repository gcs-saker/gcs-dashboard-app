import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { loginRequest } from "./authApi";
import {
  clearAccessToken,
  clearStoredUser,
  getStoredAccessToken,
  getStoredUser,
  storeAccessToken,
  storeUser,
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

  const logout = (): void => {
    clearAccessToken();
    clearStoredUser();
    setAccessToken(null);
    setCurrentUser(null);
  };

  const login = async (credentials: LoginRequest): Promise<void> => {
    const token = await loginRequest(credentials);
    const user = { username: token.username, role: token.role };
    storeAccessToken(token.access_token);
    storeUser(user);
    setAccessToken(token.access_token);
    setCurrentUser(user);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      currentUser,
      isAuthenticated: Boolean(accessToken),
      login,
      logout,
    }),
    [accessToken, currentUser],
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
