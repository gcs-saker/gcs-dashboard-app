import type { StoryDefault } from "@ladle/react";

import "@dashboard/layout/DashboardPage.scss";
import { EventLogMetricCard } from "@dashboard/components/event-log/EventLogMetricCard";
import { DashboardStoryShell } from "./DashboardStoryShell";
import "./dashboardStories.css";

export default {
  title: "Dashboard/Event log",
} satisfies StoryDefault;

export function Metrics() {
  return (
    <DashboardStoryShell
      title="운영 이벤트 로그"
      description="운영 이벤트의 주요 지표 카드 표현을 확인합니다."
    >
      <section className="event-log-metrics">
        <EventLogMetricCard label="총 이벤트" tone="info" value="3" />
        <EventLogMetricCard label="평균 RTT" tone="warning" value="377 ms" />
        <EventLogMetricCard label="오류" tone="danger" value="1" />
      </section>
    </DashboardStoryShell>
  );
}
