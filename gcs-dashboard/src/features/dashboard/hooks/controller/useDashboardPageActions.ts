import { useMemo } from "react";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";
import { useDashboardAudioActions } from "@dashboard/hooks/controller/useDashboardAudioActions";
import { useDashboardLayoutActions } from "@dashboard/hooks/controller/useDashboardLayoutActions";
import { useDashboardOverlayActions } from "@dashboard/hooks/controller/useDashboardOverlayActions";
import { useDashboardStreamActions } from "@dashboard/hooks/controller/useDashboardStreamActions";

export function useDashboardPageActions(input: DashboardPageActionInput) {
  const audio = useDashboardAudioActions(input);
  const layout = useDashboardLayoutActions(input);
  const overlay = useDashboardOverlayActions(input);
  const stream = useDashboardStreamActions(input);
  return useMemo(() => ({ ...audio, ...layout, ...overlay, ...stream }), [audio, layout, overlay, stream]);
}

export type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";
