import { streamApiV1Url, WEBRTC_ICE_SERVERS } from "@/config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";
import { optimizeIceServerOrder } from "./iceServerOrdering";
import { STREAM_JSON_ACCEPT_HEADERS } from "./streamingProtocolHeaders";

interface IceServerPayload {
  urls?: string | string[];
  username?: string | null;
  credential?: string | null;
}

const ICE_SERVER_CACHE_TTL_MS = 30_000;

interface IceServerCacheEntry {
  expiresAtMs: number;
  pending?: Promise<RTCIceServer[]>;
  servers?: RTCIceServer[];
}

const iceServerCache = new WeakMap<typeof fetch, IceServerCacheEntry>();

export async function loadWebRtcIceServers(fetcher: typeof fetch = fetch): Promise<RTCIceServer[]> {
  const cached = readIceServerCache(fetcher);
  if (cached) {
    return cached;
  }

  const pending = requestWebRtcIceServers(fetcher);
  iceServerCache.set(fetcher, {
    expiresAtMs: 0,
    pending,
  });

  return pending;
}

async function requestWebRtcIceServers(fetcher: typeof fetch): Promise<RTCIceServer[]> {
  try {
    const response = await authenticatedFetch(
      streamApiV1Url(STREAM_API_ROUTES.iceServers),
      {
        headers: STREAM_JSON_ACCEPT_HEADERS,
      },
      fetcher,
    );
    if (!response.ok) {
      iceServerCache.delete(fetcher);
      return WEBRTC_ICE_SERVERS;
    }

    const payload = (await response.json()) as IceServerPayload[];
    const iceServers = payload.map(toIceServer).filter((server): server is RTCIceServer => server !== null);
    const optimizedServers = optimizeIceServerOrder(iceServers);
    if (optimizedServers.length === 0) {
      iceServerCache.delete(fetcher);
      return WEBRTC_ICE_SERVERS;
    }
    writeIceServerCache(fetcher, optimizedServers);
    return optimizedServers;
  } catch {
    iceServerCache.delete(fetcher);
    return WEBRTC_ICE_SERVERS;
  }
}

function readIceServerCache(fetcher: typeof fetch): RTCIceServer[] | Promise<RTCIceServer[]> | null {
  const entry = iceServerCache.get(fetcher);
  if (!entry) {
    return null;
  }
  if (entry.pending) {
    return entry.pending;
  }
  if (entry.servers && entry.expiresAtMs > Date.now()) {
    return entry.servers;
  }
  iceServerCache.delete(fetcher);
  return null;
}

function writeIceServerCache(fetcher: typeof fetch, servers: RTCIceServer[]): void {
  iceServerCache.set(fetcher, {
    expiresAtMs: Date.now() + ICE_SERVER_CACHE_TTL_MS,
    servers,
  });
}

function toIceServer(payload: IceServerPayload): RTCIceServer | null {
  if (!payload.urls) {
    return null;
  }

  return {
    urls: payload.urls,
    ...(payload.username ? { username: payload.username } : {}),
    ...(payload.credential ? { credential: payload.credential } : {}),
  };
}
