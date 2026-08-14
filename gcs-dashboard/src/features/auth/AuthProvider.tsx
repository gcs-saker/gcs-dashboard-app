import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loginRequest, logoutRequest, persistTokenResponse, refreshSessionRequest } from "./authApi";
import {
  clearAuthSession,
  getStoredAccessToken,
  getStoredUser,
} from "./authStorage";
import type { AuthenticatedUser, LoginRequest } from "./types";

interface AuthContextValue {
  accessToken: string | null;
  currentUser: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  onSessionCleared?: () => void;
}

export function AuthProvider({ children, onSessionCleared }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(() =>
    getStoredUser<AuthenticatedUser>(),
  );
  const [isAuthReady, setIsAuthReady] = useState<boolean>(() => Boolean(getStoredAccessToken()));
  const didRequestLogoutRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    if (accessToken) {
      setIsAuthReady(true);
      return () => {
        disposed = true;
      };
    }
    if (didRequestLogoutRef.current) {
      setIsAuthReady(true);
      return () => {
        disposed = true;
      };
    }

    void refreshSessionRequest()
      .then((token) => {
        if (disposed) return;
        const user = tokenUser(token);
        setAccessToken(token.access_token);
        setCurrentUser(user);
      })
      .catch(() => {
        if (disposed) return;
        setAccessToken(null);
        setCurrentUser(null);
      })
      .finally(() => {
        if (!disposed) {
          setIsAuthReady(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, [accessToken]);

  const logout = useCallback((): void => {
    didRequestLogoutRef.current = true;
    clearAuthSession();
    setAccessToken(null);
    setCurrentUser(null);
    setIsAuthReady(true);
    onSessionCleared?.();
    void logoutRequest().catch(() => undefined);
  }, [onSessionCleared]);

  const login = useCallback(async (credentials: LoginRequest): Promise<void> => {
    const token = await loginRequest(credentials);
    const user = tokenUser(token);
    persistTokenResponse(token);
    didRequestLogoutRef.current = false;
    setAccessToken(token.access_token);
    setCurrentUser(user);
    setIsAuthReady(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      currentUser,
      isAuthenticated: Boolean(accessToken),
      isAuthReady,
      login,
      logout,
    }),
    [accessToken, currentUser, isAuthReady, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function tokenUser(token: Awaited<ReturnType<typeof loginRequest>>): AuthenticatedUser {
  return {
    username: token.username,
    role: token.role,
    groupId: token.group_id,
    securityVersion: token.securityVersion,
    capabilities: token.capabilities,
  };
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
