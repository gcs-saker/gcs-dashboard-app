import { afterEach, describe, expect, test } from "vitest";
import {
  LEGACY_AUTH_STORAGE_KEYS,
  clearAccessToken,
  clearAuthSession,
  getStoredAccessToken,
  getStoredUser,
  storeAccessToken,
  storeAuthSession,
} from "./authStorage";

describe("authStorage", () => {
  afterEach(() => {
    clearAuthSession();
  });

  test("keeps access token and user metadata in memory only", () => {
    storeAuthSession({
      accessToken: "memory-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: "operator01", role: "operator" },
    });

    expect(getStoredAccessToken()).toBe("memory-token");
    expect(getStoredUser()).toEqual({ username: "operator01", role: "operator" });
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.session)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.user)).toBeNull();
  });

  test("clears legacy localStorage auth data when reading a missing memory token", () => {
    window.localStorage.setItem(LEGACY_AUTH_STORAGE_KEYS.session, "legacy-session");
    window.localStorage.setItem(LEGACY_AUTH_STORAGE_KEYS.accessToken, "legacy-token");
    window.localStorage.setItem(LEGACY_AUTH_STORAGE_KEYS.user, "legacy-user");

    expect(getStoredAccessToken()).toBeNull();

    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.session)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.accessToken)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.user)).toBeNull();
  });

  test("drops expired in-memory token instead of returning stale credentials", () => {
    storeAuthSession({
      accessToken: "expired-token",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      user: { username: "operator01" },
    });

    expect(getStoredAccessToken()).toBeNull();
    expect(window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEYS.accessToken)).toBeNull();
  });

  test("stores short-lived access token in memory and clears it explicitly", () => {
    storeAccessToken("short-token");

    expect(getStoredAccessToken()).toBe("short-token");

    clearAccessToken();

    expect(getStoredAccessToken()).toBeNull();
  });
});
