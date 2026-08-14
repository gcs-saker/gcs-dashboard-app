import { describe, expect, test } from "vitest";
import {
  BROWSER_STORAGE_RESPONSIBILITIES,
  FORBIDDEN_BROWSER_STORAGE_KEYS,
} from "./storageResponsibility";

describe("storageResponsibility", () => {
  test("keeps browser storage responsibilities explicit", () => {
    expect(BROWSER_STORAGE_RESPONSIBILITIES.memoryOnly).toContain("access-token");
    expect(BROWSER_STORAGE_RESPONSIBILITIES.httpOnlyCookie).toEqual(["refresh-token"]);
    expect(BROWSER_STORAGE_RESPONSIBILITIES.indexedDb).toEqual(
      expect.arrayContaining([
        "dashboard-layout",
        "stream-device-alias",
        "cctv-grid-preference",
        "motion-mode",
        "map-preference",
        "server-health-history",
        "rtt-snapshot-cache",
      ]),
    );
    expect(BROWSER_STORAGE_RESPONSIBILITIES.sessionStorage).not.toContain("stream-device-alias");
  });

  test("documents values that must never be persisted in browser-visible storage", () => {
    expect(FORBIDDEN_BROWSER_STORAGE_KEYS).toEqual(
      expect.arrayContaining([
        "password",
        "refreshToken",
        "privateKey",
        "serverSecret",
        "longLivedAccessToken",
      ]),
    );
  });

  test("keeps forbidden auth names out of IndexedDB responsibilities", () => {
    const indexedDbResponsibilities = BROWSER_STORAGE_RESPONSIBILITIES.indexedDb.join(" ").toLowerCase();

    for (const forbiddenKey of FORBIDDEN_BROWSER_STORAGE_KEYS) {
      expect(indexedDbResponsibilities).not.toContain(forbiddenKey.toLowerCase());
    }
  });
});
