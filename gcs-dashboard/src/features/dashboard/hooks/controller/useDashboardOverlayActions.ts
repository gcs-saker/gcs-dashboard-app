import { useCallback, useMemo } from "react";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type OverlayActionInput = Pick<DashboardPageActionInput,
  "setEditingStreamId" | "setIsAssetDrawerOpen" | "setIsWidgetDialogOpen"
>;

export function useDashboardOverlayActions(input: OverlayActionInput) {
  const { setEditingStreamId, setIsAssetDrawerOpen, setIsWidgetDialogOpen } = input;
  const applyWidgetDialog = useCallback(() => {
    setIsWidgetDialogOpen(false);
  }, [setIsWidgetDialogOpen]);
  const cancelWidgetDialog = useCallback(() => {
    setIsWidgetDialogOpen(false);
  }, [setIsWidgetDialogOpen]);
  const cancelStreamConnection = useCallback(() => {
    setEditingStreamId(null);
  }, [setEditingStreamId]);
  const closeAssetDrawer = useCallback(() => setIsAssetDrawerOpen(false), [setIsAssetDrawerOpen]);

  return useMemo(() => ({ applyWidgetDialog, cancelStreamConnection, cancelWidgetDialog, closeAssetDrawer }),
    [applyWidgetDialog, cancelStreamConnection, cancelWidgetDialog, closeAssetDrawer]);
}
