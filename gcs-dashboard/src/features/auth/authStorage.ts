const ACCESS_TOKEN_KEY = "gcs_saker_access_token";
const SESSION_KEY = "gcs_saker_auth_session";
const USER_KEY = "gcs_saker_user";

export interface StoredAuthSession<TUser = unknown> {
  accessToken: string;
  expiresAt: string;
  user: TUser;
}

function parseStoredSession<TUser>(): StoredAuthSession<TUser> | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<StoredAuthSession<TUser>>;
    if (
      typeof session.accessToken !== "string" ||
      typeof session.expiresAt !== "string" ||
      !session.user ||
      Number.isNaN(new Date(session.expiresAt).getTime())
    ) {
      clearAuthSession();
      return null;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      clearAuthSession();
      return null;
    }
    return session as StoredAuthSession<TUser>;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function getStoredAccessToken(): string | null {
  return parseStoredSession()?.accessToken ?? null;
}

export function storeAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getStoredUser<T>(): T | null {
  const session = parseStoredSession<T>();
  if (session) return session.user;
  return null;
}

export function storeUser(user: unknown): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredUser(): void {
  window.localStorage.removeItem(USER_KEY);
}

export function storeAuthSession<TUser>(session: StoredAuthSession<TUser>): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
