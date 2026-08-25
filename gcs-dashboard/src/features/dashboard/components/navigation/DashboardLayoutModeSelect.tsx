import type { DashboardLayoutMode } from "@dashboard/preferences/userPreferences";

const OPTIONS: readonly { value: DashboardLayoutMode; label: string }[] = [
  { value: "expanded", label: "늘려보기" },
  { value: "map-priority", label: "지도 우선 보기" },
  { value: "stream-priority", label: "스트림 우선 보기" },
  { value: "overview", label: "한눈에 보기" },
] as const;

export function DashboardLayoutModeSelect({ mode, onChange }: {
  mode: DashboardLayoutMode;
  onChange: (mode: DashboardLayoutMode) => void;
}) {
  return <label className="dashboard-layout-mode">
    <span className="sr-only">대시보드 보기 모드</span>
    <select aria-label="대시보드 보기 모드" value={mode}
      onChange={(event) => onChange(event.target.value as DashboardLayoutMode)}>
      {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
