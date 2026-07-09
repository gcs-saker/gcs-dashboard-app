import type { StoryDefault } from "@ladle/react";

import "@/features/dashboard/DashboardPage.scss";
import { EventLogMetricCard } from "@dashboard/components/event-log/EventLogMetricCard";
import { TimelineEventRow } from "@dashboard/components/event-log/TimelineEventRow";
import { STORY_OPERATIONAL_EVENTS } from "./dashboardStoryFixtures";
import { DashboardStoryShell } from "./DashboardStoryShell";
import "./dashboardStories.css";

export default {
  title: "Dashboard/Event log",
} satisfies StoryDefault;

const noop = () => undefined;

export function TimelineAndMetrics() {
  return (
    <DashboardStoryShell
      title="운영 이벤트 로그"
      description="info/warn/error 이벤트와 주요 지표 카드가 같은 fixture 기준으로 표시되는지 확인합니다."
    >
      <section className="event-log-metrics">
        <EventLogMetricCard label="총 이벤트" tone="info" value="3" />
        <EventLogMetricCard label="평균 RTT" tone="warning" value="377 ms" />
        <EventLogMetricCard label="오류" tone="danger" value="1" />
      </section>
      <section aria-label="운영 이벤트 목록" className="event-log-timeline" role="listbox">
        {STORY_OPERATIONAL_EVENTS.map((event, index) => (
          <TimelineEventRow event={event} isSelected={index === 1} key={event.id} onSelect={noop} />
        ))}
      </section>
    </DashboardStoryShell>
  );
}
