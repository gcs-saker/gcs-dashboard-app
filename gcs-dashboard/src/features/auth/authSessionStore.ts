import { createStore } from "zustand/vanilla";
import type { TokenResponse } from "./types";

interface AuthSessionState {
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  refreshInFlight: Promise<TokenResponse> | null;
  user: unknown | null;
}

const EMPTY_AUTH_SESSION: AuthSessionState = {
  accessToken: null,
  accessTokenExpiresAt: null,
  refreshInFlight: null,
  user: null,
};

export const authSessionStore = createStore<AuthSessionState>(() => EMPTY_AUTH_SESSION);

export function clearMemoryAuthSession(): void {
  authSessionStore.setState(EMPTY_AUTH_SESSION, true);
}
