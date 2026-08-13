import { DEFAULT_ASSET_TREE, mergeAssetTreeWithStreams, type AssetTreeNode } from "./assetTree";
import { buildAccessibleAssetTree } from "./groupAssetTree";
import type { AccessibleGroupInventory } from "./groupAssetContracts";
import { createAudioAnalysisSnapshot, isSameAudioAnalysis } from "./dashboardAudioAnalysis";
import { buildCctvGridStreams, getCctvGridSize, summarizeCctvStatus, type CctvStatusSummary } from "./dashboardCctv";
import { telemetryRowsForStream, type AudioAnalysisSnapshot, type TelemetryRow } from "./dashboardPresentation";
import { getMapFocusForStream, type MapFocusViewModel } from "./mapFocus";
import { isMotionEnabled } from "./motionPreference";
import type { DashboardStreamSlot } from "./streamTypes";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { DashboardUserPreferences } from "./userPreferences";

export interface DashboardPageViewModelInput {
  preferences: DashboardUserPreferences;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  groupInventory?: AccessibleGroupInventory;
}

export interface DashboardPageViewModel {
  assetTreeRoot: AssetTreeNode;
  cctvGridSize: number;
  cctvStatusSummary: CctvStatusSummary;
  cctvStreams: DashboardStreamSlot[];
  mapFocus: MapFocusViewModel;
  motionEnabled: boolean;
  telemetryRows: TelemetryRow[];
}

export function buildDashboardPageViewModel({
  preferences,
  selectedStream,
  streams,
  groupInventory,
}: DashboardPageViewModelInput): DashboardPageViewModel {
  const cctvGridSize = getCctvGridSize(preferences.cctvLayoutMode);
  return {
    assetTreeRoot: groupInventory
      ? buildAccessibleAssetTree(groupInventory, streams)
      : mergeAssetTreeWithStreams(DEFAULT_ASSET_TREE, streams),
    cctvGridSize,
    cctvStatusSummary: summarizeCctvStatus(streams),
    cctvStreams: buildCctvGridStreams(streams, cctvGridSize),
    mapFocus: getMapFocusForStream(selectedStream),
    motionEnabled: isMotionEnabled(preferences.motionMode),
    telemetryRows: telemetryRowsForStream(selectedStream),
  };
}

export function nextAudioAnalysisState(
  current: AudioAnalysisSnapshot | null,
  streamId: string,
  snapshot: RealtimePlayerSnapshot,
  streams: DashboardStreamSlot[],
): AudioAnalysisSnapshot | null {
  const next = createAudioAnalysisSnapshot(streamId, snapshot, streams);
  return isSameAudioAnalysis(current, next) ? current : next;
}

export function nextAudioActiveStreamId(
  currentStreamId: string | null,
  streamId: string,
  snapshot: RealtimePlayerSnapshot,
): string | null {
  if (snapshot.isAudioActive) return streamId;
  return currentStreamId === streamId ? null : currentStreamId;
}

export function toggleStringSetItem(items: readonly string[], item: string): string[] {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...items, item];
}
