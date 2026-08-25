import type { DashboardDensityMode, DashboardPriorityMode } from "@dashboard/preferences/userPreferences";

const DENSITY_OPTIONS: readonly { value: DashboardDensityMode; label: string }[] = [
  { value: "expanded", label: "늘려보기" },
  { value: "overview", label: "한눈에 보기" },
] as const;
const PRIORITY_OPTIONS: readonly { value: DashboardPriorityMode; label: string }[] = [
  { value: "default", label: "기본" },
  { value: "map", label: "지도 우선" },
  { value: "stream", label: "스트림 우선" },
] as const;

export function DashboardLayoutModeSelect({ densityMode, onDensityChange, onPriorityChange, priorityMode }: {
  densityMode: DashboardDensityMode;
  onDensityChange: (mode: DashboardDensityMode) => void;
  onPriorityChange: (mode: DashboardPriorityMode) => void;
  priorityMode: DashboardPriorityMode;
}) {
  return <div className="dashboard-layout-mode">
    <label>
      <span className="sr-only">대시보드 표시 방식</span>
      <select aria-label="대시보드 표시 방식" value={densityMode}
        onChange={(event) => onDensityChange(event.target.value as DashboardDensityMode)}>
        {DENSITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <label>
      <span className="sr-only">대시보드 우선순위</span>
      <select aria-label="대시보드 우선순위" value={priorityMode}
        onChange={(event) => onPriorityChange(event.target.value as DashboardPriorityMode)}>
        {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  </div>;
}
