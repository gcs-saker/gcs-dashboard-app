import type { StoryDefault } from "@ladle/react";

import "@dashboard/layout/DashboardPage.scss";
import { AudioWaveformPanel } from "@dashboard/components/AudioWaveformPanel";
import { StreamMapPopup } from "@dashboard/map/StreamMapPopup";
import { STORY_AUDIO_ANALYSIS, STORY_STREAM_SLOTS } from "./dashboardStoryFixtures";
import { DashboardStoryShell } from "./DashboardStoryShell";
import "./dashboardStories.css";

export default {
  title: "Dashboard/Map and audio",
} satisfies StoryDefault;

const noop = () => undefined;

export function MapMarkerPopup() {
  return (
    <DashboardStoryShell
      title="지도 마커 팝업"
      description="선택 스트림의 좌표, 단말 ID, WHEP 경로를 작은 정보창으로 확인합니다."
    >
      <div className="dashboard-story-popup-stage">
        <StreamMapPopup onClose={noop} stream={STORY_STREAM_SLOTS.live} />
      </div>
    </DashboardStoryShell>
  );
}

export function AudioWaveform() {
  return (
    <DashboardStoryShell
      title="음성 파형 분석"
      description="선택 스트림 음성 수신 상태, ICE 경로, 지연/지터/손실 지표를 한 번에 봅니다."
    >
      <AudioWaveformPanel
        analysis={STORY_AUDIO_ANALYSIS}
        selectedStream={STORY_STREAM_SLOTS.live}
        talkback={{ status: "idle", errorMessage: null, hasLocalAudioTrack: false, micLevel: null, targets: [], start: async () => undefined, stop: noop }}
      />
    </DashboardStoryShell>
  );
}
