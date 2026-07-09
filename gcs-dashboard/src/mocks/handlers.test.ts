import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { authUrl, streamApiV1Url } from "@/config";
import { AUTH_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import { server } from "./node";

const TEST_ORIGIN = "http://127.0.0.1:4178";

describe("MSW dashboard mock handlers", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  test("returns preview auth token for login", async () => {
    const response = await fetch(absoluteUrl(authUrl(AUTH_ROUTES.login)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "operator01", password: "preview" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      access_token: "mock-access-token",
      username: "operator01",
      role: "operator",
    });
  });

  test("returns stream registry fixtures", async () => {
    const response = await fetch(absoluteUrl(streamApiV1Url(STREAM_API_ROUTES.streams)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          streamId: "raw.sample.front",
          status: "online",
        }),
      ]),
    );
  });

  test("can force degraded stream scenario with query parameter", async () => {
    const response = await fetch(`${absoluteUrl(streamApiV1Url(STREAM_API_ROUTES.streams))}?mockScenario=stream-503`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: "mock stream registry degraded",
    });
  });
});

function absoluteUrl(path: string): string {
  return new URL(path, TEST_ORIGIN).toString();
}
