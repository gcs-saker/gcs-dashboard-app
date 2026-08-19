import { useCallback, useRef } from "react";

import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";
import { buildPublisherGpsTelemetryPayload } from "@streaming/publisher/publisherGpsTelemetry";
import { STREAM_JSON_HEADERS } from "@streaming/protocol/streamingProtocolHeaders";

interface UsePublisherGpsSenderOptions {
  fetcher: typeof fetch;
  onSendError: (message: string) => void;
  streamId: string;
}

export function usePublisherGpsSender({ fetcher, onSendError, streamId }: UsePublisherGpsSenderOptions) {
  const pendingPositionRef = useRef<GeolocationPosition | null>(null);
  const publishStartedAtRef = useRef<number | null>(null);
  const sendInFlightRef = useRef(false);
  const sessionAbortRef = useRef<AbortController | null>(null);

  const flushPendingPositions = useCallback(async (): Promise<void> => {
    if (sendInFlightRef.current) return;
    const sessionAbort = sessionAbortRef.current;
    if (!sessionAbort) return;
    sendInFlightRef.current = true;
    try {
      while (pendingPositionRef.current && !sessionAbort.signal.aborted) {
        const position = pendingPositionRef.current;
        pendingPositionRef.current = null;
        const response = await sendPosition(fetcher, position, streamId, elapsedSeconds(publishStartedAtRef.current), sessionAbort.signal);
        if (!response.ok) onSendError(`GPS 전송 실패 ${response.status}`);
      }
    } catch (error) {
      if (!sessionAbort.signal.aborted) onSendError(error instanceof Error ? error.message : "GPS 전송 실패");
    } finally {
      sendInFlightRef.current = false;
      if (shouldContinueFlush(pendingPositionRef.current, sessionAbortRef.current, sessionAbort)) {
        queueMicrotask(() => void flushPendingPositions());
      }
    }
  }, [fetcher, onSendError, streamId]);

  const queuePosition = useCallback((position: GeolocationPosition): void => {
    pendingPositionRef.current = position;
    void flushPendingPositions();
  }, [flushPendingPositions]);
  const startSession = useCallback((): void => {
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = new AbortController();
    publishStartedAtRef.current = Date.now();
  }, []);
  const stopSession = useCallback((): void => {
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    publishStartedAtRef.current = null;
    pendingPositionRef.current = null;
  }, []);

  return { queuePosition, startSession, stopSession } as const;
}

function elapsedSeconds(startedAt: number | null): number {
  return startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
}

function shouldContinueFlush(
  pendingPosition: GeolocationPosition | null,
  currentAbort: AbortController | null,
  completedAbort: AbortController,
): boolean {
  return Boolean(pendingPosition) && currentAbort === completedAbort && !completedAbort.signal.aborted;
}

function sendPosition(
  fetcher: typeof fetch,
  position: GeolocationPosition,
  streamId: string,
  elapsedPublishSeconds: number,
  signal: AbortSignal,
): Promise<Response> {
  return authenticatedFetch(apiUrl(DASHBOARD_API_ROUTES.telemetryIngest), {
    method: "POST",
    headers: STREAM_JSON_HEADERS,
    body: JSON.stringify(buildPublisherGpsTelemetryPayload(position, streamId, elapsedPublishSeconds)),
    signal,
  }, fetcher);
}
