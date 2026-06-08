import { streamApiV1Url, WEBRTC_ICE_SERVERS } from "../../config";
import { STREAM_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../auth/authApi";

interface IceServerPayload {
  urls?: string | string[];
  username?: string | null;
  credential?: string | null;
}

const MAX_RELAY_ICE_SERVERS = 1;
const TURN_URL_PREFIX = "turn:";
const TURNS_URL_PREFIX = "turns:";
const STUN_URL_PREFIX = "stun:";
const UDP_TRANSPORT_QUERY = "transport=udp";
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
        headers: { Accept: "application/json" },
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

function optimizeIceServerOrder(servers: RTCIceServer[]): RTCIceServer[] {
  const stunServers: RTCIceServer[] = [];
  const relayServers: RTCIceServer[] = [];
  const otherServers: RTCIceServer[] = [];

  for (const server of servers) {
    if (hasUrlPrefix(server, STUN_URL_PREFIX)) {
      stunServers.push(server);
      continue;
    }
    if (hasUrlPrefix(server, TURN_URL_PREFIX) || hasUrlPrefix(server, TURNS_URL_PREFIX)) {
      relayServers.push(server);
      continue;
    }
    otherServers.push(server);
  }

  return [
    ...stunServers,
    ...otherServers,
    ...relayServers.sort(compareRelayPreference).slice(0, MAX_RELAY_ICE_SERVERS),
  ];
}

function compareRelayPreference(left: RTCIceServer, right: RTCIceServer): number {
  return relayPreferenceScore(right) - relayPreferenceScore(left);
}

function relayPreferenceScore(server: RTCIceServer): number {
  const urls = urlsFor(server);
  if (urls.some((url) => url.startsWith(TURN_URL_PREFIX) && url.includes(UDP_TRANSPORT_QUERY))) {
    return 3;
  }
  if (urls.some((url) => url.startsWith(TURN_URL_PREFIX))) {
    return 2;
  }
  if (urls.some((url) => url.startsWith(TURNS_URL_PREFIX))) {
    return 1;
  }
  return 0;
}

function hasUrlPrefix(server: RTCIceServer, prefix: string): boolean {
  return urlsFor(server).some((url) => url.startsWith(prefix));
}

function urlsFor(server: RTCIceServer): string[] {
  return Array.isArray(server.urls) ? server.urls : [server.urls];
}
