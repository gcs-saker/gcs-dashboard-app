import { describe, expect, test, vi } from "vitest";
import { fetchMapConfig } from "./mapConfig";

describe("mapConfig", () => {
  test("loads map provider config from the backend API DTO", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        provider: "custom",
        styleUrl: "https://maps.example.test/style.json",
        attribution: "Example Maps",
        requiresApiKey: true,
      }),
    })) as unknown as typeof fetch;

    await expect(fetchMapConfig(fetcher)).resolves.toEqual({
      provider: "custom",
      styleUrl: "https://maps.example.test/style.json",
      attribution: "Example Maps",
      requiresApiKey: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/map/config",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  test("falls back to the public OpenFreeMap config when the API is unavailable", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 503,
    })) as unknown as typeof fetch;

    await expect(fetchMapConfig(fetcher)).resolves.toEqual({
      provider: "openfreemap",
      styleUrl: "https://tiles.openfreemap.org/styles/liberty",
      attribution: "OpenFreeMap, OpenMapTiles, OpenStreetMap",
      requiresApiKey: false,
    });
  });
});
