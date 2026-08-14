import { useCallback, useMemo } from "react";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import { nextAudioActiveStreamId, nextAudioAnalysisState, toggleStringSetItem } from "@dashboard/layout/dashboardPageViewModel";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type AudioActionInput = Pick<DashboardPageActionInput,
  | "setAudioActiveStreamId" | "setAudioAnalysis" | "setLayoutMessage"
  | "setTalkbackTargetStreamIds" | "streams"
>;

export function useDashboardAudioActions(input: AudioActionInput) {
  const { setAudioActiveStreamId, setAudioAnalysis, setLayoutMessage, setTalkbackTargetStreamIds, streams } = input;
  const handleSelectedPlaybackStatusChange = useCallback((streamId: string, snapshot: RealtimePlayerSnapshot): void => {
    setAudioAnalysis((current) => nextAudioAnalysisState(current, streamId, snapshot, streams));
    setAudioActiveStreamId((current) => nextAudioActiveStreamId(current, streamId, snapshot));
  }, [setAudioActiveStreamId, setAudioAnalysis, streams]);
  const toggleTalkbackTarget = useCallback((streamPath: string): void => {
    setTalkbackTargetStreamIds((current) => toggleStringSetItem(current, streamPath));
    setLayoutMessage("Talkback 대상 변경됨");
  }, [setLayoutMessage, setTalkbackTargetStreamIds]);

  return useMemo(() => ({ handleSelectedPlaybackStatusChange, toggleTalkbackTarget }), [handleSelectedPlaybackStatusChange, toggleTalkbackTarget]);
}
