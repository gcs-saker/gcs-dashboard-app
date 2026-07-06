import { EVENT_CATEGORY_LABELS, EVENT_SEVERITY_LABELS } from "@dashboard/eventLogPresentation";
import type { OperationalEventCategory, OperationalEventFilters } from "@dashboard/operationalEvents";

const EVENT_FILTER_LABELS = Object.freeze({
  query: "내용",
  severity: "강도",
  category: "분류",
  source: "서버",
  from: "시작 시간",
  to: "종료 시간",
});

interface EventLogFiltersProps {
  categoryFilter: "all" | OperationalEventCategory;
  filters: OperationalEventFilters;
  onCategoryFilterChange: (category: "all" | OperationalEventCategory) => void;
  onPatchFilters: (filters: Partial<OperationalEventFilters>) => void;
  onSourceFilterChange: (source: string) => void;
  sourceFilter: string;
  sourceOptions: string[];
}

export function EventLogFilters(props: EventLogFiltersProps) {
  return (
    <div className="event-log-view__filters">
      <label>
        <span>내용 / 출처 / 분류</span>
        <input
          aria-label={EVENT_FILTER_LABELS.query}
          onChange={(event) => props.onPatchFilters({ query: event.target.value })}
          placeholder="검색어 입력"
          value={props.filters.query}
        />
      </label>
      <label>
        <span>강도</span>
        <select
          aria-label={EVENT_FILTER_LABELS.severity}
          onChange={(event) => props.onPatchFilters({ severity: event.target.value as OperationalEventFilters["severity"] })}
          value={props.filters.severity}
        >
          {Object.entries(EVENT_SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>분류</span>
        <select
          aria-label={EVENT_FILTER_LABELS.category}
          onChange={(event) => props.onCategoryFilterChange(event.target.value as "all" | OperationalEventCategory)}
          value={props.categoryFilter}
        >
          <option value="all">전체</option>
          {Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>서버</span>
        <select
          aria-label={EVENT_FILTER_LABELS.source}
          onChange={(event) => props.onSourceFilterChange(event.target.value)}
          value={props.sourceFilter}
        >
          <option value="all">전체</option>
          {props.sourceOptions.map((source) => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>
      </label>
      <label>
        <span>시작</span>
        <input
          aria-label={EVENT_FILTER_LABELS.from}
          onChange={(event) => props.onPatchFilters({ from: event.target.value })}
          type="datetime-local"
          value={props.filters.from}
        />
      </label>
      <label>
        <span>종료</span>
        <input
          aria-label={EVENT_FILTER_LABELS.to}
          onChange={(event) => props.onPatchFilters({ to: event.target.value })}
          type="datetime-local"
          value={props.filters.to}
        />
      </label>
    </div>
  );
}
