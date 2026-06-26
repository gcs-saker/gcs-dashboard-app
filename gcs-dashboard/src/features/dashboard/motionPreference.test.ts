import { afterEach, describe, expect, test, vi } from "vitest";
import {
  detectPreferredMotionMode,
  isMotionEnabled,
  normalizeMotionMode,
} from "./motionPreference";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("motionPreference", () => {
  test("normalizes supported motion modes and rejects invalid values", () => {
    expect(normalizeMotionMode("full", "off")).toBe("full");
    expect(normalizeMotionMode("reduced", "off")).toBe("reduced");
    expect(normalizeMotionMode("off", "full")).toBe("off");
    expect(normalizeMotionMode("unknown", "reduced")).toBe("reduced");
  });

  test("uses browser reduced-motion preference as default", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    expect(detectPreferredMotionMode()).toBe("reduced");
    expect(normalizeMotionMode(undefined)).toBe("reduced");
  });

  test("disables JS animation only when mode is off", () => {
    expect(isMotionEnabled("full")).toBe(true);
    expect(isMotionEnabled("reduced")).toBe(true);
    expect(isMotionEnabled("off")).toBe(false);
  });
});
