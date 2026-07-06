import {
  SETTINGS_POLICIES,
  settingsTabTitle,
  type PolicySettingsTab,
} from "@dashboard/timeSyncSettingsContracts";

interface SettingsPolicyPanelProps {
  tab: PolicySettingsTab;
}

export function SettingsPolicyPanel({ tab }: SettingsPolicyPanelProps) {
  return (
    <section className="time-sync-view__policy" aria-label="운영 정책">
      <header className="time-sync-view__policy-header">
        <div>
          <span>설정 묶음</span>
          <strong>{settingsTabTitle(tab)}</strong>
        </div>
        <button type="button">변경 요청</button>
      </header>
      {SETTINGS_POLICIES[tab].map(([label, value]) => (
        <article key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <em>현재 정책</em>
        </article>
      ))}
    </section>
  );
}
