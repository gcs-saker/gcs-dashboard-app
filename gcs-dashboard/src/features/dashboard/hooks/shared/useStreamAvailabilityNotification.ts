import { useEffect, useRef, useState } from "react";
import { isReceivableStream } from "@dashboard/streaming/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

export interface StreamAvailabilityNotification {
  id: string;
  message: string;
}

export function useStreamAvailabilityNotification(
  streams: DashboardStreamSlot[],
): [StreamAvailabilityNotification | null, (notification: StreamAvailabilityNotification | null) => void] {
  const [streamNotification, setStreamNotification] = useState<StreamAvailabilityNotification | null>(null);
  const knownAvailableStreamIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const availableStreams = streams.filter(isReceivableStream);
    const availableStreamIds = new Set(availableStreams.map((stream) => stream.id));
    if (!knownAvailableStreamIdsRef.current) {
      knownAvailableStreamIdsRef.current = availableStreamIds;
      return;
    }

    const addedStream = availableStreams.find((stream) => !knownAvailableStreamIdsRef.current?.has(stream.id));
    if (addedStream) {
      setStreamNotification({
        id: `${addedStream.id}-${Date.now()}`,
        message: `수신 가능한 스트림 감지: ${addedStream.title}`,
      });
    }
    knownAvailableStreamIdsRef.current = availableStreamIds;
  }, [streams]);

  useEffect(() => {
    if (!streamNotification) return;
    const timeoutId = globalThis.setTimeout(() => setStreamNotification(null), 4500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [streamNotification]);

  return [streamNotification, setStreamNotification];
}
