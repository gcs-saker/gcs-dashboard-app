import { describe, expect, test } from "vitest";
import { evaluateMapEngineRequirements, chooseDashboardMapEngine } from "./mapEngineDecision";

describe("mapEngineDecision", () => {
  test("keeps the active public satellite map on the lightweight Leaflet path", () => {
    expect(chooseDashboardMapEngine({
      attribution: "Satellite",
      provider: "esri-satellite",
      requiresApiKey: false,
      styleUrl: "https://tiles.example.test/{z}/{y}/{x}",
    })).toBe("leaflet-public");
  });

  test("routes closed-network profiles to the offline Leaflet renderer", () => {
    expect(chooseDashboardMapEngine({
      attribution: "Offline",
      provider: "offline",
      requiresApiKey: false,
      styleUrl: "/tiles/{z}/{x}/{y}.png",
    })).toBe("leaflet-offline");
  });

  test("documents when MapLibre should be reconsidered instead of staying installed unused", () => {
    expect(evaluateMapEngineRequirements({
      expectedMarkerCount: 1_200,
      needsOfflineTiles: false,
      needsVectorStyleEditing: false,
      requiresSatelliteTiles: true,
    })).toMatchObject({
      engine: "maplibre-reintroduction-candidate",
    });
  });

  test("keeps public Leaflet when satellite tiles are needed without vector editing pressure", () => {
    expect(evaluateMapEngineRequirements({
      expectedMarkerCount: 50,
      needsOfflineTiles: false,
      needsVectorStyleEditing: false,
      requiresSatelliteTiles: true,
    })).toMatchObject({
      engine: "leaflet-public",
    });
  });

  test("prioritizes closed-network tile availability over vector styling preferences", () => {
    expect(evaluateMapEngineRequirements({
      expectedMarkerCount: 5_000,
      needsOfflineTiles: true,
      needsVectorStyleEditing: true,
      requiresSatelliteTiles: false,
    })).toMatchObject({
      engine: "leaflet-offline",
    });
  });
});
