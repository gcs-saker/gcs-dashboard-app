import { useState } from "react";
import type { DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";

export function useDashboardLocalUiState() {
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [audioActiveStreamId, setAudioActiveStreamId] = useState<string | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisSnapshot | null>(null);
  const [talkbackTargetStreamIds, setTalkbackTargetStreamIds] = useState<string[]>([]);
  const [popoutWidgetId, setPopoutWidgetId] = useState<DashboardWidgetId | null>(null);

  return {
    audioActiveStreamId,
    audioAnalysis,
    isAssetDrawerOpen,
    isWidgetDialogOpen,
    popoutWidgetId,
    setAudioActiveStreamId,
    setAudioAnalysis,
    setIsAssetDrawerOpen,
    setIsWidgetDialogOpen,
    setPopoutWidgetId,
    setTalkbackTargetStreamIds,
    talkbackTargetStreamIds,
  };
}
