import { HttpResponse, type JsonBodyType } from "msw";

const JSON_HEADERS = Object.freeze({ "Content-Type": "application/json" });

export enum MockScenario {
  PARAM = "mockScenario",
  AUTH_401 = "auth-401",
  AUTH_500 = "auth-500",
  STREAM_503 = "stream-503",
}

export function json(payload: JsonBodyType, status = 200): HttpResponse<JsonBodyType> {
  return HttpResponse.json(payload, { status, headers: JSON_HEADERS });
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
