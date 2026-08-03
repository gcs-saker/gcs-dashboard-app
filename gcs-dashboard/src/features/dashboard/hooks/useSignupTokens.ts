import { useCallback, useEffect, useState } from "react";
import { fetchSignupTokens, issueSignupToken } from "@dashboard/signupTokenApi";
import type { IssueSignupTokenInput, SignupTokenIssue, SignupTokenRecord } from "@dashboard/signupTokens";

export function useSignupTokens(fetcher: typeof fetch = fetch) {
  const [records, setRecords] = useState<SignupTokenRecord[]>([]);
  const [issuedToken, setIssuedToken] = useState<SignupTokenIssue | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [isIssuing, setIssuing] = useState(false);
  const [errorMessage, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fetchSignupTokens(fetcher));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "회원가입 토큰 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  const issue = useCallback(async (input: IssueSignupTokenInput) => {
    setIssuing(true);
    setIssuedToken(null);
    try {
      const result = await issueSignupToken(input, fetcher);
      setIssuedToken(result);
      setRecords(await fetchSignupTokens(fetcher));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "회원가입 토큰 발급에 실패했습니다.");
    } finally {
      setIssuing(false);
    }
  }, [fetcher]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { records, issuedToken, isLoading, isIssuing, errorMessage, refresh, issue, clear: () => setIssuedToken(null) };
}
