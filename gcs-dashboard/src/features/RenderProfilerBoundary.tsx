import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";

import { isRenderDiagnosticsEnabled, publishRenderProfilerCommit } from "./renderDiagnostics";

interface RenderProfilerBoundaryProps {
  children: ReactNode;
  env?: ImportMetaEnv;
  id: string;
}

export function RenderProfilerBoundary({
  children,
  env = import.meta.env,
  id,
}: RenderProfilerBoundaryProps) {
  if (!isRenderDiagnosticsEnabled(env)) {
    return <>{children}</>;
  }

  return <Profiler id={id} onRender={createProfilerCommitHandler(env)}>{children}</Profiler>;
}

function createProfilerCommitHandler(env: ImportMetaEnv): ProfilerOnRenderCallback {
  return (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    publishRenderProfilerCommit({
      actualDurationMs: actualDuration,
      baseDurationMs: baseDuration,
      commitTimeMs: commitTime,
      id,
      phase,
      startTimeMs: startTime,
    }, env);
  };
}
