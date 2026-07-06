import { SETTINGS_TABS, type SettingsTab } from "@dashboard/timeSyncSettingsContracts";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onChangeTab: (tab: SettingsTab) => void;
}

export function SettingsTabs({ activeTab, onChangeTab }: SettingsTabsProps) {
  return (
    <nav className="time-sync-view__tabs" aria-label="운영설정 탭">
      {SETTINGS_TABS.map((tab) => (
        <button
          aria-pressed={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : ""}
          key={tab.id}
          onClick={() => onChangeTab(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
