import { SETTINGS_TABS, type SettingsTab } from "@dashboard/operations/timeSyncSettingsContracts";

interface SettingsTabsProps {
  activeTab: SettingsTab;
  onChangeTab: (tab: SettingsTab) => void;
  visibleTabs?: readonly SettingsTab[];
}

export function SettingsTabs({ activeTab, onChangeTab, visibleTabs }: SettingsTabsProps) {
  const tabs = visibleTabs ? SETTINGS_TABS.filter((tab) => visibleTabs.includes(tab.id)) : SETTINGS_TABS;
  return (
    <nav className="time-sync-view__tabs" aria-label="운영설정 탭">
      {tabs.map((tab) => (
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
