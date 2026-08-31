import type { StoryDefault } from "@ladle/react";

import "@dashboard/layout/DashboardPage.scss";
import { SystemServiceCards } from "@dashboard/components/system-status/SystemServiceCards";
import { SystemStatePreview } from "@dashboard/components/system-status/SystemStatePreview";
import { STORY_SERVICE_CARDS } from "./dashboardStoryFixtures";
import { DashboardStoryShell } from "./DashboardStoryShell";
import "./dashboardStories.css";

export default {
  title: "Dashboard/System status",
} satisfies StoryDefault;

export function ServiceCards() {
  return (
    <DashboardStoryShell
      title="서버 상태 카드"
      description="정상/주의/오류 상태가 한 화면에서 어떻게 보이는지 검토합니다."
    >
      <SystemServiceCards serviceCards={STORY_SERVICE_CARDS} />
      <SystemStatePreview />
    </DashboardStoryShell>
  );
}
