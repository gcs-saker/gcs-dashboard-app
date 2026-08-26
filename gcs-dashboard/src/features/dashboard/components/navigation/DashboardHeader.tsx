import { TalkbackControlPanel } from "@dashboard/components/TalkbackControlPanel";
import type { AuthenticatedUser } from "@auth/types";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { DashboardDensityMode, DashboardPriorityMode, DashboardView } from "@dashboard/preferences/userPreferences";
import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";
import { DashboardLayoutModeSelect } from "./DashboardLayoutModeSelect";

export interface DashboardHeaderProps {
  activeView: DashboardView;
  currentUser: AuthenticatedUser | null;
  dashboardDensityMode: DashboardDensityMode;
  dashboardPriorityMode: DashboardPriorityMode;
  isAssetDrawerOpen: boolean;
  onChangeView: (view: DashboardView) => void;
  onLogout: () => void;
  onOpenAssetDrawer: () => void;
  onResetLayout: () => void;
  onSetDashboardDensityMode: (mode: DashboardDensityMode) => void;
  onSetDashboardPriorityMode: (mode: DashboardPriorityMode) => void;
  streams: DashboardStreamSlot[];
  selectedStreamId: string;
  talkbackTargetStreamIds: string[];
  talkback: TalkbackPublisherSnapshot;
}

const DASHBOARD_TABS: readonly { id: DashboardView; label: string }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "cctv", label: "CCTV" },
  { id: "events", label: "이벤트로그" },
  { id: "status", label: "서버상태" },
  { id: "settings", label: "운영설정" },
] as const;

export function DashboardHeader({
  activeView,
  currentUser,
  dashboardDensityMode,
  dashboardPriorityMode,
  isAssetDrawerOpen,
  onChangeView,
  onLogout,
  onOpenAssetDrawer,
  onResetLayout,
  onSetDashboardDensityMode,
  onSetDashboardPriorityMode,
  streams, selectedStreamId,
  talkbackTargetStreamIds,
  talkback,
}: DashboardHeaderProps) {
  return (
    <header className="ops-dashboard__tabs" aria-label="주요 탭">
      <DashboardTabs activeView={activeView} onChangeView={onChangeView} />
      <div className="ops-dashboard__actions">
        {activeView === "dashboard" ? <DashboardLayoutModeSelect densityMode={dashboardDensityMode}
          onDensityChange={onSetDashboardDensityMode} onPriorityChange={onSetDashboardPriorityMode}
          priorityMode={dashboardPriorityMode} /> : null}
        <div className="ops-dashboard__action-group">
          <button
            aria-controls="asset-tree-drawer"
            aria-expanded={activeView === "dashboard" && isAssetDrawerOpen}
            className="ops-command-button asset-menu-button"
            onClick={onOpenAssetDrawer}
            disabled={activeView !== "dashboard"}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            자산
          </button>
        </div>
        <TalkbackControlPanel selectedStreamId={selectedStreamId} selectedStreamIds={talkbackTargetStreamIds} streams={streams} talkback={talkback} />
        <div className="ops-dashboard__action-group">
          <a
            className="ops-command-button is-primary"
            href="/stream"
            rel="noopener noreferrer"
            target="_blank"
          >
            스트림 화면
          </a>
          <button className="ops-command-button" onClick={onResetLayout} type="button">
            초기화
          </button>
        </div>
        <details className="ops-user-menu">
          <summary>{currentUser ? currentUser.username : "미리보기"}</summary>
          <button onClick={onLogout} type="button">로그아웃</button>
        </details>
      </div>
    </header>
  );
}

function DashboardTabs({ activeView, onChangeView }: Pick<DashboardHeaderProps, "activeView" | "onChangeView">) {
  return (
    <nav className="ops-dashboard__tab-list">
      {DASHBOARD_TABS.map((tab) => (
        <button
          className={`ops-tab ${activeView === tab.id ? "is-active" : ""}`}
          key={tab.id}
          onClick={() => onChangeView(tab.id)}
          type="button"
        >{tab.label}</button>
      ))}
    </nav>
  );
}
