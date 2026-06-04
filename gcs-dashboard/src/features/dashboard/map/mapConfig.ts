import { apiV1Url, FALLBACK_MAP_CONFIG } from "@/config";
import type { DashboardMapConfig, DashboardMapProvider } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@/features/auth/authApi";

interface MapConfigPayload {
  provider?: unknown;
  styleUrl?: unknown;
  attribution?: unknown;
  requiresApiKey?: unknown;
}

export async function fetchMapConfig(fetcher: typeof fetch = fetch): Promise<DashboardMapConfig> {
  try {
    const response = await authenticatedFetch(
      apiV1Url(STREAM_API_ROUTES.mapConfig),
      {
        headers: { Accept: "application/json" },
      },
      fetcher,
    );
    if (!response.ok) {
      return FALLBACK_MAP_CONFIG;
    }

    return parseMapConfig(await response.json());
  } catch {
    return FALLBACK_MAP_CONFIG;
  }
}

function parseMapConfig(payload: unknown): DashboardMapConfig {
  if (!payload || typeof payload !== "object") {
    return FALLBACK_MAP_CONFIG;
  }
  const candidate = payload as MapConfigPayload;
  const provider = parseProvider(candidate.provider);
  const styleUrl = typeof candidate.styleUrl === "string" && candidate.styleUrl.trim()
    ? candidate.styleUrl
    : FALLBACK_MAP_CONFIG.styleUrl;

  return {
    provider,
    styleUrl,
    attribution: typeof candidate.attribution === "string" ? candidate.attribution : FALLBACK_MAP_CONFIG.attribution,
    requiresApiKey: typeof candidate.requiresApiKey === "boolean"
      ? candidate.requiresApiKey
      : FALLBACK_MAP_CONFIG.requiresApiKey,
  };
}

function parseProvider(provider: unknown): DashboardMapProvider {
  if (provider === "openfreemap" || provider === "offline" || provider === "custom") {
    return provider;
  }
  return FALLBACK_MAP_CONFIG.provider;
}
