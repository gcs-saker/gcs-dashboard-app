import type { StoryDefault } from "@ladle/react";

import "@dashboard/layout/DashboardPage.scss";
import "@streaming/components/RealtimePlayer.css";
import { RealtimePlayerPlaceholder } from "@streaming/components/realtime/RealtimePlayerPlaceholder";
import { StreamCard } from "@dashboard/components/StreamCard";
import { STORY_STREAM_LIST, STORY_STREAM_SLOTS } from "./dashboardStoryFixtures";
import { DashboardStoryShell } from "./DashboardStoryShell";
import "./dashboardStories.css";

export default {
  title: "Dashboard/Stream states",
} satisfies StoryDefault;

const noop = () => undefined;

export function StreamCards() {
  return (
    <DashboardStoryShell
      title="스트림 카드 상태"
      description="API fixture와 공유하는 스트림 상태값으로 idle/live/reconnecting/error/fallback UI를 고정합니다."
    >
      <section className="dashboard-story-grid">
        {STORY_STREAM_LIST.map((stream) => (
          <StreamCard
            hasAudioActivity={stream.id === STORY_STREAM_SLOTS.live.id}
            isSelected={stream.id === STORY_STREAM_SLOTS.live.id}
            isTalkbackTarget={stream.id === STORY_STREAM_SLOTS.live.id}
            key={stream.id}
            onSelect={noop}
            onToggleTalkbackTarget={noop}
            stream={stream}
          />
        ))}
      </section>
    </DashboardStoryShell>
  );
}

export function PlayerPlaceholders() {
  return (
    <DashboardStoryShell
      title="플레이어 연결 상태"
      description="실제 WebRTC 연결 없이 플레이어 loading/reconnecting/offline/error 표시 계약을 확인합니다."
    >
      <section className="dashboard-story-player-grid">
        <div className="realtime-player">
          <RealtimePlayerPlaceholder mode="loading" />
        </div>
        <div className="realtime-player">
          <RealtimePlayerPlaceholder mode="reconnecting" reconnectDelayMs={1200} />
        </div>
        <div className="realtime-player">
          <RealtimePlayerPlaceholder mode="offline" />
        </div>
        <div className="realtime-player">
          <RealtimePlayerPlaceholder errorMessage="WHEP signaling failed" mode="error" />
        </div>
      </section>
    </DashboardStoryShell>
  );
}
