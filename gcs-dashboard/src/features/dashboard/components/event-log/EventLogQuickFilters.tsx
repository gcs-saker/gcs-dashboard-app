import { EVENT_SEVERITY_LABELS } from "@dashboard/operations/eventLogPresentation";
import type { OperationalEventFilters } from "@dashboard/operations/operationalEvents";

interface EventLogQuickFiltersProps {
  activeFilterText: string;
  filters: OperationalEventFilters;
  onPatchFilters: (filters: Partial<OperationalEventFilters>) => void;
  onResetFilters: () => void;
}

export function EventLogQuickFilters({
  activeFilterText,
  filters,
  onPatchFilters,
  onResetFilters,
}: EventLogQuickFiltersProps) {
  return (
    <div className="event-log-view__quickbar" aria-label="빠른 이벤트 필터">
      <div>
        <span>빠른 필터</span>
        {(["all", "warn", "error"] as const).map((severity) => (
          <button
            aria-pressed={filters.severity === severity}
            className={filters.severity === severity ? "is-active" : ""}
            key={severity}
            onClick={() => onPatchFilters({ severity })}
            type="button"
          >
            {EVENT_SEVERITY_LABELS[severity]}
          </button>
        ))}
      </div>
      <strong>{activeFilterText}</strong>
      <button onClick={onResetFilters} type="button">초기화</button>
    </div>
  );
}
