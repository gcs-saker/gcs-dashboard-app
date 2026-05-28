const ACCESS_TOKEN_KEY = "gcs_saker_access_token";
const SESSION_KEY = "gcs_saker_auth_session";
const USER_KEY = "gcs_saker_user";

export interface StoredAuthSession<TUser = unknown> {
  accessToken?: string;
  expiresAt: string;
  refreshAvailable?: boolean;
  user: TUser;
}

let memoryAccessToken: string | null = null;
let memoryAccessTokenExpiresAt: string | null = null;

function parseStoredSession<TUser>(): StoredAuthSession<TUser> | null {
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as Partial<StoredAuthSession<TUser>>;
    if (
      typeof session.expiresAt !== "string" ||
      !session.user ||
      Number.isNaN(new Date(session.expiresAt).getTime())
    ) {
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
  if (memoryAccessToken && isFutureIsoDate(memoryAccessTokenExpiresAt)) {
    return memoryAccessToken;
  }

  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
  const session = parseStoredSession();
  if (session?.accessToken && isFutureIsoDate(session.expiresAt)) {
    setMemoryAccessToken(session.accessToken, session.expiresAt);
    storeAuthSession({ expiresAt: session.expiresAt, user: session.user });
    return session.accessToken;
  }
  return null;
}

export function storeAccessToken(token: string): void {
  setMemoryAccessToken(token, new Date(Date.now() + 5 * 60_000).toISOString());
}

export function clearAccessToken(): void {
  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
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
  setMemoryAccessToken(session.accessToken ?? null, session.expiresAt);
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      expiresAt: session.expiresAt,
      refreshAvailable: true,
      user: session.user,
    }),
  );
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function clearAuthSession(): void {
  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function hasStoredSessionMetadata(): boolean {
  return parseStoredSession()?.refreshAvailable === true;
}

function setMemoryAccessToken(token: string | null, expiresAt: string): void {
  memoryAccessToken = token;
  memoryAccessTokenExpiresAt = token ? expiresAt : null;
}

function isFutureIsoDate(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}
