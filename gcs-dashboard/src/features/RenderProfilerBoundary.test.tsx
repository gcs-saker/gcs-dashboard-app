import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { clearRenderDiagnostics } from "./renderDiagnostics";
import { RenderProfilerBoundary } from "./RenderProfilerBoundary";

describe("RenderProfilerBoundary", () => {
  afterEach(() => {
    clearRenderDiagnostics();
  });

  it("renders children without profiler commits when diagnostics are disabled", () => {
    render(
      <RenderProfilerBoundary id="ProbePanel" env={testEnv({ DEV: true })}>
        <strong>프로파일 대상</strong>
      </RenderProfilerBoundary>,
    );

    expect(screen.getByText("프로파일 대상")).toBeInTheDocument();
    expect(profilerCommits().ProbePanel).toBeUndefined();
  });

  it("publishes profiler commits only when the dev flag is enabled", () => {
    render(
      <RenderProfilerBoundary id="ProbePanel" env={testEnv({ DEV: true, VITE_RENDER_DIAGNOSTICS: "1" })}>
        <strong>프로파일 대상</strong>
      </RenderProfilerBoundary>,
    );

    expect(profilerCommits().ProbePanel?.[0]).toMatchObject({
      id: "ProbePanel",
      phase: "mount",
    });
  });
});

function profilerCommits(): Record<string, unknown[]> {
  return (globalThis as typeof globalThis & {
    __GCS_SAKER_RENDER_PROFILER_COMMITS__?: Record<string, unknown[]>;
  }).__GCS_SAKER_RENDER_PROFILER_COMMITS__ ?? {};
}

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
