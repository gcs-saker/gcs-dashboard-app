import { useEffect, useState } from "react";
import { useWhepPlayback } from "@streaming/hooks/playback/useWhepPlayback";
import { fetchAuthorizedTalkbackPlayback } from "@streaming/publisher/publisherApi";

export function useTalkbackAudioReceiver(autoStart: boolean, streamId: string) {
  const [enabled, setEnabled] = useState(autoStart);
  const [whepUrl, setWhepUrl] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  useEffect(() => {
    if (autoStart) setEnabled(true);
  }, [autoStart]);
  useEffect(() => createTalkbackSession({ enabled, retryAttempt, setRetryAttempt,
    setSessionError, setWhepUrl, streamId }), [enabled, retryAttempt, streamId]);
  const playback = useWhepPlayback({ whepUrl, isOnline: enabled });
  const retryError = sessionError ?? playback.errorMessage;
  useEffect(() => scheduleTalkbackRetry({ enabled, error: retryError, retryAttempt,
    setRetryAttempt, setWhepUrl }), [enabled, retryAttempt, retryError]);
  return { enabled, playback, sessionError, setEnabled } as const;
}

function createTalkbackSession(input: {
  enabled: boolean;
  retryAttempt: number;
  setRetryAttempt: (attempt: number) => void;
  setSessionError: (error: string | null) => void;
  setWhepUrl: (url: string | null) => void;
  streamId: string;
}): (() => void) | undefined {
  if (!input.enabled) {
    input.setWhepUrl(null); input.setSessionError(null); input.setRetryAttempt(0);
    return undefined;
  }
  let current = true;
  void fetchAuthorizedTalkbackPlayback(input.streamId, fetch)
    .then((url) => { if (current) { input.setSessionError(null); input.setWhepUrl(url); } })
    .catch((error: unknown) => {
      if (current) input.setSessionError(error instanceof Error ? error.message : "관제 음성 수신 인증 실패");
    });
  return () => { current = false; };
}

function scheduleTalkbackRetry(input: {
  enabled: boolean;
  error: string | null;
  retryAttempt: number;
  setRetryAttempt: (attempt: number | ((current: number) => number)) => void;
  setWhepUrl: (url: string | null) => void;
}): (() => void) | undefined {
  if (!input.enabled || !input.error || input.retryAttempt >= 8) return undefined;
  const delayMs = Math.min(1_000 * 2 ** input.retryAttempt, 10_000);
  const timeoutId = window.setTimeout(() => {
    input.setWhepUrl(null);
    input.setRetryAttempt((current) => current + 1);
  }, delayMs);
  return () => window.clearTimeout(timeoutId);
}
