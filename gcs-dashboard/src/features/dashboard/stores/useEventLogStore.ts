import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { OperationalEventCategory, OperationalEventFilters } from "@dashboard/operations/operationalEvents";

export const DEFAULT_OPERATIONAL_EVENT_FILTERS: OperationalEventFilters = Object.freeze({
  query: "",
  severity: "all",
  from: "",
  to: "",
} as const);

type EventLogFilterPatch = Partial<OperationalEventFilters>;
type EventLogCategoryFilter = "all" | OperationalEventCategory;
const EVENT_LOG_FILTER_ALL = "all";

export interface EventLogStoreState {
  filters: OperationalEventFilters;
  categoryFilter: EventLogCategoryFilter;
  sourceFilter: string;
  selectedEventId: string | null;
  patchFilters: (patch: EventLogFilterPatch) => void;
  setCategoryFilter: (category: EventLogCategoryFilter) => void;
  setSourceFilter: (source: string) => void;
  setSelectedEventId: (eventId: string | null) => void;
  resetFilters: () => void;
}

export const useEventLogStore = create<EventLogStoreState>((set) => ({
  filters: DEFAULT_OPERATIONAL_EVENT_FILTERS,
  categoryFilter: EVENT_LOG_FILTER_ALL,
  sourceFilter: EVENT_LOG_FILTER_ALL,
  selectedEventId: null,
  patchFilters: (patch) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...patch,
      },
    })),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
  setSelectedEventId: (selectedEventId) => set({ selectedEventId }),
  resetFilters: () =>
    set({
      filters: DEFAULT_OPERATIONAL_EVENT_FILTERS,
      categoryFilter: EVENT_LOG_FILTER_ALL,
      sourceFilter: EVENT_LOG_FILTER_ALL,
    }),
}));

export function useEventLogFilterState() {
  return useEventLogStore(useShallow((state) => ({
    categoryFilter: state.categoryFilter,
    filters: state.filters,
    selectedEventId: state.selectedEventId,
    sourceFilter: state.sourceFilter,
  })));
}

export function useEventLogActions() {
  return useEventLogStore(useShallow((state) => ({
    patchFilters: state.patchFilters,
    resetFilters: state.resetFilters,
    setCategoryFilter: state.setCategoryFilter,
    setSelectedEventId: state.setSelectedEventId,
    setSourceFilter: state.setSourceFilter,
  })));
}
