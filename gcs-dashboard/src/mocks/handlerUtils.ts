import { HttpResponse, type JsonBodyType } from "msw";

const JSON_HEADERS = Object.freeze({ "Content-Type": "application/json" });
const SSE_HEADERS = Object.freeze({ "Content-Type": "text/event-stream" });

export enum MockScenario {
  PARAM = "mockScenario",
  AUTH_401 = "auth-401",
  AUTH_403 = "auth-403",
  AUTH_500 = "auth-500",
  OPS_503 = "ops-503",
  STREAM_503 = "stream-503",
  TELEMETRY_503 = "telemetry-503",
}

export function json(payload: JsonBodyType, status = 200): HttpResponse<JsonBodyType> {
  return HttpResponse.json(payload, { status, headers: JSON_HEADERS });
}

export function eventStream(messages: readonly string[]): HttpResponse<string> {
  return new HttpResponse(messages.join("\n\n"), { status: 200, headers: SSE_HEADERS });
}

export function urlPattern(path: string): RegExp {
  const pathname = path.startsWith("http") ? new URL(path).pathname : path;
  const pattern = pathname
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:streamId/g, "[^/?]+")
    .replace(/:uuid/g, "[^/?]+");
  return new RegExp(`${pattern}(?:\\?.*)?$`);
}

export function hasScenario(request: Request, scenario: MockScenario): boolean {
  return new URL(request.url).searchParams.get(MockScenario.PARAM) === scenario;
}
