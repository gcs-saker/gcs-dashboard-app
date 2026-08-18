import { useEffect, useRef, useState } from "react";
import { isReceivableStream } from "@dashboard/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";

export interface StreamAvailabilityNotification {
  id: string;
  message: string;
  streamId: string;
}

export function useStreamAvailabilityNotification(
  streams: DashboardStreamSlot[],
  onStreamAvailable?: (streamId: string) => void,
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
      onStreamAvailable?.(addedStream.id);
      setStreamNotification({
        id: `${addedStream.id}-${Date.now()}`,
        message: `수신 가능한 스트림 감지: ${addedStream.title}`,
        streamId: addedStream.id,
      });
    }
    knownAvailableStreamIdsRef.current = availableStreamIds;
  }, [onStreamAvailable, streams]);

  useEffect(() => {
    if (!streamNotification) return;
    const timeoutId = globalThis.setTimeout(() => setStreamNotification(null), 4500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [streamNotification]);

  return [streamNotification, setStreamNotification];
}
