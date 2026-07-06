import { ApiHttpError } from "@features/apiClient";
import { authenticatedFetch } from "@auth/authApi";
import type { OperationalEvent, OperationalEventFilters } from "./operationalEvents";
import { isOperationalEvent } from "./operationalEventGuards";
import { buildOperationalEventStreamUrl } from "./operationalEventRoutes";

const OPERATIONAL_EVENT_STREAM_EVENT = "operational-event";
const OPERATIONAL_EVENT_STREAM_HEARTBEAT = "heartbeat";
const SSE_FIELD_EVENT = "event:";
const SSE_FIELD_DATA = "data:";

export class OperationalEventStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationalEventStreamError";
  }
}

export interface OperationalEventStreamHandlers {
  onEvent: (event: OperationalEvent) => void;
  onHeartbeat?: (checkedAt: string | null) => void;
}

interface OperationalEventStreamOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

interface SseMessage {
  event: string;
  data: string;
}

export async function consumeOperationalEventStream(
  filters: OperationalEventFilters,
  handlers: OperationalEventStreamHandlers,
  options: OperationalEventStreamOptions = {},
): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await authenticatedFetch(buildOperationalEventStreamUrl(filters), {
    headers: { Accept: "text/event-stream" },
    signal: options.signal,
  }, fetcher);

  const reader = eventStreamBody(response).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseOperationalEventSseBuffer(buffer);
    buffer = parsed.remaining;
    parsed.messages.forEach((message) => handleOperationalEventStreamMessage(message, handlers));
    if (done) break;
  }

  const flushed = parseOperationalEventSseBuffer(`${buffer}\n\n`);
  flushed.messages.forEach((message) => handleOperationalEventStreamMessage(message, handlers));
}

export function parseOperationalEventSseBuffer(buffer: string): {
  messages: SseMessage[];
  remaining: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remaining = blocks.pop() ?? "";
  const messages = blocks
    .map(parseSseBlock)
    .filter((message): message is SseMessage => message !== null);
  return { messages, remaining };
}

function parseSseBlock(block: string): SseMessage | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(SSE_FIELD_EVENT)) {
      event = line.slice(SSE_FIELD_EVENT.length).trim();
    }
    if (line.startsWith(SSE_FIELD_DATA)) {
      dataLines.push(line.slice(SSE_FIELD_DATA.length).trimStart());
    }
  }
  if (!event || dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function handleOperationalEventStreamMessage(
  message: SseMessage,
  handlers: OperationalEventStreamHandlers,
): void {
  if (message.event === OPERATIONAL_EVENT_STREAM_EVENT) {
    const payload = parseStreamPayload(message.data, "Operational event stream payload");
    if (!isOperationalEvent(payload)) {
      throw new OperationalEventStreamError("Operational event stream payload is invalid");
    }
    handlers.onEvent(payload);
    return;
  }
  if (message.event === OPERATIONAL_EVENT_STREAM_HEARTBEAT) {
    const payload = parseStreamPayload(message.data, "Operational event heartbeat");
    handlers.onHeartbeat?.(typeof payload.checkedAt === "string" ? payload.checkedAt : null);
  }
}

function eventStreamBody(response: Response): ReadableStream<Uint8Array> {
  if (!response.ok) {
    throw new ApiHttpError(response.status, `Operational event stream request failed with ${response.status}`);
  }
  if (!response.body) {
    throw new OperationalEventStreamError("Operational event stream response body is unavailable");
  }
  return response.body;
}

function parseStreamPayload(data: string, description: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(data) as unknown;
    if (!payload || typeof payload !== "object") {
      throw new OperationalEventStreamError(`${description} must be a JSON object`);
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OperationalEventStreamError) throw error;
    throw new OperationalEventStreamError(`${description} JSON is invalid`);
  }
}
