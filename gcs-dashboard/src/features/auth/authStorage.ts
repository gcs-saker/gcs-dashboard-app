export const LEGACY_AUTH_STORAGE_KEYS = Object.freeze({
  accessToken: "gcs_saker_access_token",
  session: "gcs_saker_auth_session",
  user: "gcs_saker_user",
});

export interface StoredAuthSession<TUser = unknown> {
  accessToken?: string;
  expiresAt: string;
  refreshAvailable?: boolean;
  user: TUser;
}

let memoryAccessToken: string | null = null;
let memoryAccessTokenExpiresAt: string | null = null;
let memoryUser: unknown | null = null;

function clearLegacyBrowserStorage(): void {
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.session);
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.user);
}

export function getStoredAccessToken(): string | null {
  if (memoryAccessToken && isFutureIsoDate(memoryAccessTokenExpiresAt)) {
    return memoryAccessToken;
  }

  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
  clearLegacyBrowserStorage();
  return null;
}

export function storeAccessToken(token: string): void {
  setMemoryAccessToken(token, new Date(Date.now() + 5 * 60_000).toISOString());
}

export function clearAccessToken(): void {
  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
  clearLegacyBrowserStorage();
}

export function getStoredUser<T>(): T | null {
  return (memoryUser as T | null) ?? null;
}

export function storeUser(user: unknown): void {
  memoryUser = user;
  clearLegacyBrowserStorage();
}

export function clearStoredUser(): void {
  memoryUser = null;
  clearLegacyBrowserStorage();
}

export function storeAuthSession<TUser>(session: StoredAuthSession<TUser>): void {
  setMemoryAccessToken(session.accessToken ?? null, session.expiresAt);
  memoryUser = session.user;
  clearLegacyBrowserStorage();
}

export function clearAuthSession(): void {
  memoryAccessToken = null;
  memoryAccessTokenExpiresAt = null;
  memoryUser = null;
  clearLegacyBrowserStorage();
}

function setMemoryAccessToken(token: string | null, expiresAt: string): void {
  memoryAccessToken = token;
  memoryAccessTokenExpiresAt = token ? expiresAt : null;
}

function isFutureIsoDate(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}
