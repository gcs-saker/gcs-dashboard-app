import type { DashboardStreamSlot } from "./streamTypes";
import { getDashboardStreamDisplayName } from "./streamTypes";
import type { useWhipAudioPublisher } from "@streaming/hooks/useWhipAudioPublisher";

export type TalkbackStatus = ReturnType<typeof useWhipAudioPublisher>["status"];

export interface TalkbackSelectionViewModel {
  readonly selectedStreamPaths: string[];
  readonly selectedStreams: DashboardStreamSlot[];
  readonly targetsText: string;
}

export function buildTalkbackSelectionViewModel(
  streams: readonly DashboardStreamSlot[],
  selectedStreamIds: readonly string[],
): TalkbackSelectionViewModel {
  const selectedStreams = streams.filter((stream) => stream.streamPath && selectedStreamIds.includes(stream.streamPath));
  const selectedStreamPaths = selectedStreams.map((stream) => stream.streamPath).filter(Boolean) as string[];
  return {
    selectedStreamPaths,
    selectedStreams,
    targetsText: selectedStreams.length > 0
      ? selectedStreams.map(getDashboardStreamDisplayName).join(", ")
      : "대상 없음",
  };
}

export function isTalkbackActive(status: TalkbackStatus): boolean {
  return status === "active" || status === "publishing" || status === "requesting-mic";
}

export function formatTalkbackMicLevel(level: number | null): string {
  if (level === null) return "대기";
  return `${Math.round(level * 100)}%`;
}

export function talkbackStatusText(status: TalkbackStatus): string {
  const labels: Record<TalkbackStatus, string> = {
    idle: "Talkback 대기",
    "requesting-mic": "마이크 권한",
    publishing: "송신 연결",
    active: "송신 중",
    error: "송신 오류",
  };
  return labels[status];
}
