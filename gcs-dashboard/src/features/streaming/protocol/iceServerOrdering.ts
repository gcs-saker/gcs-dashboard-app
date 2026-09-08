const MAX_RELAY_ICE_SERVERS = 1;
const TURN_URL_PREFIX = "turn:";
const TURNS_URL_PREFIX = "turns:";
const STUN_URL_PREFIX = "stun:";
const UDP_TRANSPORT_QUERY = "transport=udp";

export function optimizeIceServerOrder(servers: RTCIceServer[]): RTCIceServer[] {
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
    // oxlint-disable-next-line unicorn/no-array-sort -- The ES2022 browser target requires sorting an owned copy.
    ...relayServers.slice().sort(compareRelayPreference).slice(0, MAX_RELAY_ICE_SERVERS),
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
