import { authSessionStore, clearMemoryAuthSession } from "./authSessionStore";

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

function clearLegacyBrowserStorage(): void {
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.session);
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEYS.user);
}

export function getStoredAccessToken(): string | null {
  const { accessToken, accessTokenExpiresAt } = authSessionStore.getState();
  if (accessToken && isFutureIsoDate(accessTokenExpiresAt)) {
    return accessToken;
  }

  authSessionStore.setState({ accessToken: null, accessTokenExpiresAt: null });
  clearLegacyBrowserStorage();
  return null;
}

export function storeAccessToken(token: string): void {
  setMemoryAccessToken(token, new Date(Date.now() + 5 * 60_000).toISOString());
}

export function clearAccessToken(): void {
  authSessionStore.setState({ accessToken: null, accessTokenExpiresAt: null });
  clearLegacyBrowserStorage();
}

export function getStoredUser(): unknown | null {
  return authSessionStore.getState().user;
}

export function storeUser(user: unknown): void {
  authSessionStore.setState({ user });
  clearLegacyBrowserStorage();
}

export function clearStoredUser(): void {
  authSessionStore.setState({ user: null });
  clearLegacyBrowserStorage();
}

export function storeAuthSession<TUser>(session: StoredAuthSession<TUser>): void {
  setMemoryAccessToken(session.accessToken ?? null, session.expiresAt);
  authSessionStore.setState({ user: session.user });
  clearLegacyBrowserStorage();
}

export function clearAuthSession(): void {
  clearMemoryAuthSession();
  clearLegacyBrowserStorage();
}

function setMemoryAccessToken(token: string | null, expiresAt: string): void {
  authSessionStore.setState({ accessToken: token, accessTokenExpiresAt: token ? expiresAt : null });
}

function isFutureIsoDate(value: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}
