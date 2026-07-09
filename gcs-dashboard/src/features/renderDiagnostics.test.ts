import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  clearRenderDiagnostics,
  isRenderDiagnosticsEnabled,
  publishRenderProfilerCommit,
  RENDER_DIAGNOSTIC_BASELINES,
  RENDER_DIAGNOSTIC_LABELS,
  RENDER_DIAGNOSTIC_TOOL_DECISIONS,
  useRenderDiagnostics,
} from "@features/renderDiagnostics";

describe("renderDiagnostics", () => {
  afterEach(() => {
    clearRenderDiagnostics();
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

  test("records tool decisions and hotspot baselines without external runtime dependencies", () => {
    expect(RENDER_DIAGNOSTIC_TOOL_DECISIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ decision: "adopted", name: "React Profiler" }),
        expect.objectContaining({ decision: "deferred", name: "React Scan" }),
        expect.objectContaining({ decision: "deferred", name: "why-did-you-render" }),
      ]),
    );
    expect(RENDER_DIAGNOSTIC_BASELINES.streamGrid.maxExpectedRenders).toBe(2);
    expect(RENDER_DIAGNOSTIC_BASELINES.audioWaveformPanel.maxExpectedRenders).toBe(2);
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

  test("keeps profiler commits behind the same dev-only guard", () => {
    publishRenderProfilerCommit({
      actualDurationMs: 1,
      baseDurationMs: 2,
      commitTimeMs: 3,
      id: "ProbePanel",
      phase: "mount",
      startTimeMs: 0,
    }, testEnv({ DEV: false, VITE_RENDER_DIAGNOSTICS: "1" }));

    expect((globalThis as typeof globalThis & {
      __GCS_SAKER_RENDER_PROFILER_COMMITS__?: Record<string, unknown[]>;
    }).__GCS_SAKER_RENDER_PROFILER_COMMITS__).toBeUndefined();

    publishRenderProfilerCommit({
      actualDurationMs: 1,
      baseDurationMs: 2,
      commitTimeMs: 3,
      id: "ProbePanel",
      phase: "mount",
      startTimeMs: 0,
    }, testEnv({ DEV: true, VITE_RENDER_DIAGNOSTICS: "1" }));

    expect((globalThis as typeof globalThis & {
      __GCS_SAKER_RENDER_PROFILER_COMMITS__?: Record<string, unknown[]>;
    }).__GCS_SAKER_RENDER_PROFILER_COMMITS__?.ProbePanel).toHaveLength(1);
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
