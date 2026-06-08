import { useEffect, useReducer } from "react";
import { fetchOperationalEvents } from "../operationalEventsApi";
import type { OperationalEvent, OperationalEventFilters } from "../operationalEvents";

interface OperationalEventsState {
  events: OperationalEvent[];
  errorMessage: string | null;
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

type OperationalEventsAction =
  | { type: "loading" }
  | { type: "loaded"; events: OperationalEvent[] }
  | { type: "error"; message: string };

const initialState: OperationalEventsState = {
  events: [],
  errorMessage: null,
  isLoading: true,
  lastUpdatedAt: null,
};

export function useOperationalEvents(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  pollIntervalMs = 10_000,
): OperationalEventsState {
  const [state, dispatch] = useReducer(operationalEventsReducer, initialState);

  useEffect(() => {
    const abortController = new AbortController();
    let disposed = false;
    let timeoutId: number | null = null;

    const load = () => {
      dispatch({ type: "loading" });
      void fetchOperationalEvents(filters, ((input, init) =>
        fetcher(input, { ...init, signal: abortController.signal })) as typeof fetch)
        .then((events) => {
          if (disposed) return;
          dispatch({ type: "loaded", events });
        })
        .catch((error) => {
          if (disposed || abortController.signal.aborted) return;
          dispatch({
            type: "error",
            message: error instanceof Error ? error.message : "Operational events request failed",
          });
        })
        .finally(() => {
          if (disposed || pollIntervalMs <= 0) return;
          timeoutId = window.setTimeout(load, pollIntervalMs);
        });
    };

    load();

    return () => {
      disposed = true;
      abortController.abort();
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetcher, filters, pollIntervalMs]);

  return state;
}

function operationalEventsReducer(
  state: OperationalEventsState,
  action: OperationalEventsAction,
): OperationalEventsState {
  switch (action.type) {
    case "loading":
      return { ...state, isLoading: true, errorMessage: null };
    case "loaded":
      return {
        events: action.events,
        errorMessage: null,
        isLoading: false,
        lastUpdatedAt: Date.now(),
      };
    case "error":
      return { ...state, errorMessage: action.message, isLoading: false };
  }
}
