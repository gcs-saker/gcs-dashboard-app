import { useCallback, useEffect, useReducer } from "react";
import { fetchProvisioningTokens, issueProvisioningToken } from "@dashboard/deviceProvisioningTokenApi";
import type {
  IssueProvisioningTokenInput,
  ProvisioningTokenIssue,
  ProvisioningTokenRecord,
} from "@dashboard/deviceProvisioningTokens";

interface ProvisioningTokenState {
  errorMessage: string | null;
  issuedToken: ProvisioningTokenIssue | null;
  isIssuing: boolean;
  isLoading: boolean;
  records: ProvisioningTokenRecord[];
}

type ProvisioningTokenAction =
  | { type: "loading" }
  | { type: "loaded"; records: ProvisioningTokenRecord[] }
  | { type: "failed"; message: string }
  | { type: "issuing" }
  | { type: "issued"; issue: ProvisioningTokenIssue; records: ProvisioningTokenRecord[] }
  | { type: "issueFailed"; message: string }
  | { type: "clearIssuedToken" };

const initialState: ProvisioningTokenState = {
  errorMessage: null,
  issuedToken: null,
  isIssuing: false,
  isLoading: true,
  records: [],
};

export function useProvisioningTokens(fetcher: typeof fetch = fetch) {
  const [state, dispatch] = useReducer(provisioningTokenReducer, initialState);

  const refresh = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({ type: "loaded", records: await fetchProvisioningTokens(fetcher) });
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error, "장비 등록 토큰 조회 실패") });
    }
  }, [fetcher]);

  const issue = useCallback(async (input: IssueProvisioningTokenInput) => {
    dispatch({ type: "issuing" });
    try {
      const issued = await issueProvisioningToken(input, fetcher);
      const records = await fetchProvisioningTokens(fetcher);
      dispatch({ type: "issued", issue: issued, records });
    } catch (error) {
      dispatch({ type: "issueFailed", message: errorMessage(error, "장비 등록 토큰 발급 실패") });
    }
  }, [fetcher]);

  const clearIssuedToken = useCallback(() => {
    dispatch({ type: "clearIssuedToken" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    clearIssuedToken,
    issue,
    refresh,
  };
}

function provisioningTokenReducer(
  state: ProvisioningTokenState,
  action: ProvisioningTokenAction,
): ProvisioningTokenState {
  switch (action.type) {
    case "loading":
      return { ...state, errorMessage: null, isLoading: true };
    case "loaded":
      return { ...state, errorMessage: null, isLoading: false, records: action.records };
    case "failed":
      return { ...state, errorMessage: action.message, isLoading: false };
    case "issuing":
      return { ...state, errorMessage: null, issuedToken: null, isIssuing: true };
    case "issued":
      return {
        ...state,
        errorMessage: null,
        issuedToken: action.issue,
        isIssuing: false,
        records: action.records,
      };
    case "issueFailed":
      return { ...state, errorMessage: action.message, isIssuing: false };
    case "clearIssuedToken":
      return { ...state, issuedToken: null };
    default:
      return state;
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
