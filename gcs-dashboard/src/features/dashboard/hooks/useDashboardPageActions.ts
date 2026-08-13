import { useMemo } from "react";
import type { DashboardPageActionInput } from "./dashboardPageActionContracts";
import { useDashboardAudioActions } from "./useDashboardAudioActions";
import { useDashboardLayoutActions } from "./useDashboardLayoutActions";
import { useDashboardOverlayActions } from "./useDashboardOverlayActions";
import { useDashboardStreamActions } from "./useDashboardStreamActions";

export function useDashboardPageActions(input: DashboardPageActionInput) {
  const audio = useDashboardAudioActions(input);
  const layout = useDashboardLayoutActions(input);
  const overlay = useDashboardOverlayActions(input);
  const stream = useDashboardStreamActions(input);
  return useMemo(() => ({ ...audio, ...layout, ...overlay, ...stream }), [audio, layout, overlay, stream]);
}

export type { DashboardPageActionInput } from "./dashboardPageActionContracts";
