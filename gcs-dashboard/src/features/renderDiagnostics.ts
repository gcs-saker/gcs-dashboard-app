import { useEffect, useRef } from "react";

export interface RenderDiagnosticSnapshot {
  label: string;
  renderCount: number;
}

const RENDER_DIAGNOSTICS_FLAG = "VITE_RENDER_DIAGNOSTICS";

export const RENDER_DIAGNOSTIC_LABELS = Object.freeze({
  audioWaveformPanel: "AudioWaveformPanel",
  dashboardPageController: "DashboardPageController",
  eventLogView: "EventLogView",
  publicVectorMap: "PublicVectorMap",
  selectedStreamPanel: "SelectedStreamPanel",
  streamGrid: "StreamGrid",
  systemStatusPanel: "SystemStatusPanel",
  tacticalLeafletMap: "TacticalLeafletMap",
} as const);

export function isRenderDiagnosticsEnabled(env: ImportMetaEnv = import.meta.env): boolean {
  return env.DEV && env[RENDER_DIAGNOSTICS_FLAG] === "1";
}

export function useRenderDiagnostics(label: string, env: ImportMetaEnv = import.meta.env): void {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    if (!isRenderDiagnosticsEnabled(env)) return;
    publishRenderDiagnostic({ label, renderCount: renderCountRef.current });
  });
}

function publishRenderDiagnostic(snapshot: RenderDiagnosticSnapshot): void {
  const diagnostics = globalThis as typeof globalThis & {
    __GCS_SAKER_RENDER_DIAGNOSTICS__?: Record<string, RenderDiagnosticSnapshot>;
  };
  diagnostics.__GCS_SAKER_RENDER_DIAGNOSTICS__ = {
    ...diagnostics.__GCS_SAKER_RENDER_DIAGNOSTICS__,
    [snapshot.label]: snapshot,
  };
}
