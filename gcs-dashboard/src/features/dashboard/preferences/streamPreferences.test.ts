import { describe, expect, test } from "vitest";
import {
  EMPTY_STREAM_PREFERENCES,
  applyStreamDeviceAliases,
  normalizeStreamPreferencesSnapshot,
  setStreamDeviceAlias,
} from "@dashboard/preferences/streamPreferences";

describe("streamPreferences", () => {
  test("updates stream aliases as immutable preference snapshots", () => {
    const withAlias = setStreamDeviceAlias(EMPTY_STREAM_PREFERENCES, "raw.mobile.front", " 전방 단말 ");
    const withoutAlias = setStreamDeviceAlias(withAlias, "raw.mobile.front", " ");

    expect(withAlias).not.toBe(EMPTY_STREAM_PREFERENCES);
    expect(withAlias.deviceAliases).toEqual({ "raw.mobile.front": "전방 단말" });
    expect(withoutAlias.deviceAliases).toEqual({});
  });

  test("applies aliases without mutating device records", () => {
    const devices = [{ id: "raw.mobile.front", name: "raw.mobile.front" }];
    const aliased = applyStreamDeviceAliases(devices, { "raw.mobile.front": "전방 단말" });

    expect(aliased).toEqual([{ id: "raw.mobile.front", name: "전방 단말" }]);
    expect(devices).toEqual([{ id: "raw.mobile.front", name: "raw.mobile.front" }]);
  });

  test("normalizes persisted alias snapshots without trusting malformed values", () => {
    expect(normalizeStreamPreferencesSnapshot({
      deviceAliases: {
        "raw.mobile.front": "전방 단말",
        invalid: 42,
      },
      refreshToken: "must-not-persist",
    })).toEqual({
      deviceAliases: {
        "raw.mobile.front": "전방 단말",
      },
    });
  });
});
