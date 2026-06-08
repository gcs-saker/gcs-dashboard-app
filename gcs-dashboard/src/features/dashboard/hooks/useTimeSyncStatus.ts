import { useCallback, useEffect, useReducer } from "react";
import { checkTimeSync, fetchTimeSyncStatus, updateTimeSyncConfig } from "../timeSyncApi";
import type { TimeSyncConfigInput, TimeSyncStatus } from "../timeSync";

interface TimeSyncState {
  errorMessage: string | null;
  isLoading: boolean;
  isSaving: boolean;
  lastUpdatedAt: number | null;
  status: TimeSyncStatus | null;
}

type TimeSyncAction =
  | { type: "loading" }
  | { type: "loaded"; status: TimeSyncStatus }
  | { type: "failed"; message: string }
  | { type: "saving" }
  | { type: "saved"; status: TimeSyncStatus }
  | { type: "saveFailed"; message: string };

const initialState: TimeSyncState = {
  errorMessage: null,
  isLoading: true,
  isSaving: false,
  lastUpdatedAt: null,
  status: null,
};

export function useTimeSyncStatus(fetcher: typeof fetch = fetch) {
  const [state, dispatch] = useReducer(timeSyncReducer, initialState);

  const refresh = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", status: await fetchTimeSyncStatus(fetcher) });
    } catch (error) {
      dispatch({ type: "failed", message: error instanceof Error ? error.message : "시간 상태 조회 실패" });
    }
  }, [fetcher]);

  const runCheck = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", status: await checkTimeSync(fetcher) });
    } catch (error) {
      dispatch({ type: "failed", message: error instanceof Error ? error.message : "시간 점검 실패" });
    }
  }, [fetcher]);

  const save = useCallback(async (config: TimeSyncConfigInput) => {
    dispatch({ type: "saving" });
    try {
      dispatch({ type: "saved", status: await updateTimeSyncConfig(config, fetcher) });
    } catch (error) {
      dispatch({ type: "saveFailed", message: error instanceof Error ? error.message : "시간 설정 저장 실패" });
    }
  }, [fetcher]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
    runCheck,
    save,
  };
}

function timeSyncReducer(state: TimeSyncState, action: TimeSyncAction): TimeSyncState {
  switch (action.type) {
    case "loading":
      return { ...state, errorMessage: null, isLoading: true };
    case "loaded":
      return {
        ...state,
        errorMessage: null,
        isLoading: false,
        lastUpdatedAt: Date.now(),
        status: action.status,
      };
    case "failed":
      return { ...state, errorMessage: action.message, isLoading: false };
    case "saving":
      return { ...state, errorMessage: null, isSaving: true };
    case "saved":
      return {
        ...state,
        errorMessage: null,
        isSaving: false,
        lastUpdatedAt: Date.now(),
        status: action.status,
      };
    case "saveFailed":
      return { ...state, errorMessage: action.message, isSaving: false };
    default:
      return state;
  }
}
