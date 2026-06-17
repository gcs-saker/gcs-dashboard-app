import { create } from "zustand";
import type { OperationalEventCategory, OperationalEventFilters } from "../operationalEvents";

export const DEFAULT_OPERATIONAL_EVENT_FILTERS: OperationalEventFilters = Object.freeze({
  query: "",
  severity: "all",
  from: "",
  to: "",
} as const);

type EventLogFilterPatch = Partial<OperationalEventFilters>;
type EventLogCategoryFilter = "all" | OperationalEventCategory;

interface EventLogStoreState {
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
  categoryFilter: "all",
  sourceFilter: "all",
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
      categoryFilter: "all",
      sourceFilter: "all",
    }),
}));
