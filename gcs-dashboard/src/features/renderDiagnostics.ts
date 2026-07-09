import { useEffect, useRef } from "react";

export interface RenderDiagnosticSnapshot {
  label: string;
  renderCount: number;
}

export interface RenderProfilerCommit {
  actualDurationMs: number;
  baseDurationMs: number;
  commitTimeMs: number;
  id: string;
  phase: "mount" | "nested-update" | "update";
  startTimeMs: number;
}

export interface RenderDiagnosticBaseline {
  label: string;
  maxExpectedRenders: number;
  scenario: string;
}

export interface RenderDiagnosticToolDecision {
  decision: "adopted" | "deferred";
  name: string;
  reason: string;
}

type RenderDiagnosticsGlobal = typeof globalThis & {
  __GCS_SAKER_RENDER_DIAGNOSTICS__?: Record<string, RenderDiagnosticSnapshot>;
  __GCS_SAKER_RENDER_PROFILER_COMMITS__?: Record<string, RenderProfilerCommit[]>;
};

export const RENDER_DIAGNOSTICS_FLAG = "VITE_RENDER_DIAGNOSTICS";

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

export const RENDER_DIAGNOSTIC_BASELINES = Object.freeze({
  audioWaveformPanel: {
    label: RENDER_DIAGNOSTIC_LABELS.audioWaveformPanel,
    maxExpectedRenders: 2,
    scenario: "선택 스트림이 같고 audio analysis reference가 같으면 추가 렌더를 만들지 않는다.",
  },
  streamGrid: {
    label: RENDER_DIAGNOSTIC_LABELS.streamGrid,
    maxExpectedRenders: 2,
    scenario: "stream status 1개 변경 시 변경된 카드만 실제 렌더링한다.",
  },
} satisfies Record<string, RenderDiagnosticBaseline>);

export const RENDER_DIAGNOSTIC_TOOL_DECISIONS = Object.freeze([
  {
    decision: "adopted",
    name: "React Profiler",
    reason: "React 내장 도구라 추가 dependency 없이 dev flag 뒤에서 commit duration을 기록할 수 있다.",
  },
  {
    decision: "deferred",
    name: "React Scan",
    reason: "렌더 원인을 눈으로 보기 좋지만 runtime overlay 성격이 강해 M10에서는 문서 후보로만 둔다.",
  },
  {
    decision: "deferred",
    name: "why-did-you-render",
    reason: "memo 누락 탐지에는 유용하지만 React 19 조합과 production bundle 격리를 더 검증한 뒤 도입한다.",
  },
] satisfies RenderDiagnosticToolDecision[]);

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
  const diagnostics = globalThis as RenderDiagnosticsGlobal;
  diagnostics.__GCS_SAKER_RENDER_DIAGNOSTICS__ = {
    ...diagnostics.__GCS_SAKER_RENDER_DIAGNOSTICS__,
    [snapshot.label]: snapshot,
  };
}

export function publishRenderProfilerCommit(commit: RenderProfilerCommit, env: ImportMetaEnv = import.meta.env): void {
  if (!isRenderDiagnosticsEnabled(env)) return;
  const diagnostics = globalThis as RenderDiagnosticsGlobal;
  const currentCommits = diagnostics.__GCS_SAKER_RENDER_PROFILER_COMMITS__?.[commit.id] ?? [];
  diagnostics.__GCS_SAKER_RENDER_PROFILER_COMMITS__ = {
    ...diagnostics.__GCS_SAKER_RENDER_PROFILER_COMMITS__,
    [commit.id]: [...currentCommits.slice(-19), commit],
  };
}

export function clearRenderDiagnostics(): void {
  const diagnostics = globalThis as RenderDiagnosticsGlobal;
  delete diagnostics.__GCS_SAKER_RENDER_DIAGNOSTICS__;
  delete diagnostics.__GCS_SAKER_RENDER_PROFILER_COMMITS__;
}
