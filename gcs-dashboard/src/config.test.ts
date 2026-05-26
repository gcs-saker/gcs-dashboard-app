import { describe, expect, test } from "vitest";

import { apiV1Url, buildApiV1Url } from "./config";

describe("config API URL helpers", () => {
  test("keeps the default /api base compatible with v1 routes", () => {
    expect(apiV1Url("/streams/raw.sample.front/playback")).toBe(
      "/api/v1/streams/raw.sample.front/playback",
    );
  });

  test("adds the /api/v1 prefix when VITE_API_BASE_URL points to the backend origin", () => {
    expect(buildApiV1Url("http://127.0.0.1:8026", "/streams")).toBe(
      "http://127.0.0.1:8026/api/v1/streams",
    );
  });

  test("does not duplicate /api when the configured base already includes it", () => {
    expect(buildApiV1Url("https://gcs.example.test/api", "streams")).toBe(
      "https://gcs.example.test/api/v1/streams",
    );
  });
});
