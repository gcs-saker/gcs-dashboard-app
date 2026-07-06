import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { isRenderDiagnosticsEnabled, RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@features/renderDiagnostics";

describe("renderDiagnostics", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { __GCS_SAKER_RENDER_DIAGNOSTICS__?: unknown }).__GCS_SAKER_RENDER_DIAGNOSTICS__;
  });

  test("enables diagnostics only in explicit dev mode", () => {
    expect(isRenderDiagnosticsEnabled(testEnv({
      DEV: true,
      VITE_RENDER_DIAGNOSTICS: "1",
    }))).toBe(true);
  });

  test("keeps diagnostics off by default", () => {
    expect(isRenderDiagnosticsEnabled(testEnv({
      DEV: true,
      VITE_RENDER_DIAGNOSTICS: undefined,
    }))).toBe(false);
    expect(isRenderDiagnosticsEnabled(testEnv({
      DEV: false,
      VITE_RENDER_DIAGNOSTICS: "1",
    }))).toBe(false);
  });

  test("keeps dashboard render diagnostic labels centralized", () => {
    expect(RENDER_DIAGNOSTIC_LABELS).toEqual({
      audioWaveformPanel: "AudioWaveformPanel",
      dashboardPageController: "DashboardPageController",
      eventLogView: "EventLogView",
      publicVectorMap: "PublicVectorMap",
      selectedStreamPanel: "SelectedStreamPanel",
      streamGrid: "StreamGrid",
      systemStatusPanel: "SystemStatusPanel",
      tacticalLeafletMap: "TacticalLeafletMap",
    });
  });

  test("publishes render counts only when diagnostics are enabled", () => {
    const { rerender } = renderHook(() => useRenderDiagnostics("ProbePanel", testEnv({
      DEV: true,
      VITE_RENDER_DIAGNOSTICS: "1",
    })));

    rerender();

    expect((globalThis as typeof globalThis & {
      __GCS_SAKER_RENDER_DIAGNOSTICS__?: Record<string, { renderCount: number }>;
    }).__GCS_SAKER_RENDER_DIAGNOSTICS__?.ProbePanel.renderCount).toBe(2);
  });
});

function testEnv(overrides: Partial<ImportMetaEnv>): ImportMetaEnv {
  return {
    BASE_URL: "/",
    DEV: true,
    MODE: "test",
    PROD: false,
    SSR: false,
    ...overrides,
  } as ImportMetaEnv;
}
