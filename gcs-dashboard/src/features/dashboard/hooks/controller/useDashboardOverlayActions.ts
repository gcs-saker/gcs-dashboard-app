import { useCallback, useMemo } from "react";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type OverlayActionInput = Pick<DashboardPageActionInput,
  "setEditingStreamId" | "setIsAssetDrawerOpen" | "setIsWidgetDialogOpen" | "setLayoutMessage"
>;

export function useDashboardOverlayActions(input: OverlayActionInput) {
  const { setEditingStreamId, setIsAssetDrawerOpen, setIsWidgetDialogOpen, setLayoutMessage } = input;
  const applyWidgetDialog = useCallback(() => {
    setIsWidgetDialogOpen(false);
    setLayoutMessage("레이아웃 변경 적용됨");
  }, [setIsWidgetDialogOpen, setLayoutMessage]);
  const cancelWidgetDialog = useCallback(() => {
    setIsWidgetDialogOpen(false);
    setLayoutMessage("레이아웃 변경 취소됨");
  }, [setIsWidgetDialogOpen, setLayoutMessage]);
  const cancelStreamConnection = useCallback(() => {
    setEditingStreamId(null);
    setLayoutMessage("스트림 연결 변경 취소됨");
  }, [setEditingStreamId, setLayoutMessage]);
  const closeAssetDrawer = useCallback(() => setIsAssetDrawerOpen(false), [setIsAssetDrawerOpen]);

  return useMemo(() => ({ applyWidgetDialog, cancelStreamConnection, cancelWidgetDialog, closeAssetDrawer }),
    [applyWidgetDialog, cancelStreamConnection, cancelWidgetDialog, closeAssetDrawer]);
}
