import { TalkbackControlPanel } from "@dashboard/components/TalkbackControlPanel";
import type { AuthenticatedUser } from "@auth/types";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import type { DashboardView } from "@dashboard/userPreferences";
import type { TalkbackPublisherSnapshot } from "@streaming/talkbackPublisherContracts";

export interface DashboardHeaderProps {
  activeView: DashboardView;
  currentUser: AuthenticatedUser | null;
  isAssetDrawerOpen: boolean;
  layoutMessage: string;
  onChangeView: (view: DashboardView) => void;
  onLogout: () => void;
  onOpenAssetDrawer: () => void;
  onOpenWidgetDialog: () => void;
  onResetLayout: () => void;
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
  isAssetDrawerOpen,
  layoutMessage,
  onChangeView,
  onLogout,
  onOpenAssetDrawer,
  onOpenWidgetDialog,
  onResetLayout,
  streams,
  selectedStreamId,
  talkbackTargetStreamIds,
  talkback,
}: DashboardHeaderProps) {
  return (
    <header className="ops-dashboard__tabs" aria-label="주요 탭">
      <nav className="ops-dashboard__tab-list">
        {DASHBOARD_TABS.map((tab) => (
          <button
            className={`ops-tab ${activeView === tab.id ? "is-active" : ""}`}
            key={tab.id}
            onClick={() => onChangeView(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="ops-dashboard__actions">
        <div className="ops-dashboard__action-group">
          <button
            aria-controls="asset-tree-drawer"
            aria-expanded={isAssetDrawerOpen}
            className="ops-command-button asset-menu-button"
            onClick={onOpenAssetDrawer}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            자산
          </button>
          <span className="ops-layout-status" role="status">{layoutMessage}</span>
        </div>
        <TalkbackControlPanel selectedStreamId={selectedStreamId} selectedStreamIds={talkbackTargetStreamIds} streams={streams} talkback={talkback} />
        <div className="ops-dashboard__action-group">
          <button aria-label="위젯 추가" className="ops-command-button" onClick={onOpenWidgetDialog} type="button">
            레이아웃
          </button>
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
