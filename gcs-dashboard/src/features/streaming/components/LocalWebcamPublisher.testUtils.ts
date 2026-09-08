import { vi } from "vitest";

export type PeerConnectionMock = RTCPeerConnection & {
  completeIceGathering: () => void;
  completeConnection: () => void;
  disconnect: () => void;
};

export function createPeerConnectionMock(initialIceGatheringState: RTCIceGatheringState = "complete"): PeerConnectionMock {
  let iceGatheringState = initialIceGatheringState;
  let connectionState: RTCPeerConnectionState = "connected";
  let iceConnectionState: RTCIceConnectionState = "connected";
  let iceGatheringStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let connectionStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  let iceConnectionStateChangeHandler: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  const peerConnection = {
    get connectionState() {
      return connectionState;
    },
    get iceConnectionState() {
      return iceConnectionState;
    },
    get iceGatheringState() {
      return iceGatheringState;
    },
    get onicegatheringstatechange() {
      return iceGatheringStateChangeHandler;
    },
    set onicegatheringstatechange(handler) {
      iceGatheringStateChangeHandler = handler;
    },
    get onconnectionstatechange() {
      return connectionStateChangeHandler;
    },
    set onconnectionstatechange(handler) {
      connectionStateChangeHandler = handler;
    },
    get oniceconnectionstatechange() {
      return iceConnectionStateChangeHandler;
    },
    set oniceconnectionstatechange(handler) {
      iceConnectionStateChangeHandler = handler;
    },
    localDescription: { type: "offer", sdp: "v=0\r\nmock-offer" },
    addTrack: vi.fn(),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0\r\nmock-offer" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
    completeIceGathering() {
      iceGatheringState = "complete";
      iceGatheringStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("icegatheringstatechange"));
    },
    completeConnection() {
      connectionState = "connected";
      iceConnectionState = "connected";
      connectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
    disconnect() {
      connectionState = "disconnected";
      iceConnectionState = "disconnected";
      connectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("connectionstatechange"));
      iceConnectionStateChangeHandler?.call(peerConnection as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
    },
  } as unknown as PeerConnectionMock;
  return peerConnection;
}

export function createGeolocationMock(coords: Partial<GeolocationCoordinates>): Geolocation {
  const position = {
    coords: {
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      latitude: 0,
      longitude: 0,
      speed: null,
      toJSON: () => ({}),
      ...coords,
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
  return {
    getCurrentPosition: vi.fn((success: PositionCallback) => success(position)),
    watchPosition: vi.fn((success: PositionCallback) => {
      success(position);
      return 7;
    }),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
}

export function createPublisherFetcher(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.includes("/api/v1/streams/ice-servers")) {
      return {
        ok: true,
        json: async () => [{ urls: "stun:stun.l.google.com:19302" }],
      } as Response;
    }
    if (requestUrl.includes("/api/v1/streams/") && requestUrl.endsWith("/publish")) {
      return {
        ok: true,
        json: async () => ({
          iceServers: [{ urls: "stun:a4ai.tplinkdns.com:3478" }],
          streamId: "raw.local.webcam",
          whipUrl: "http://media.example.test/authorized/whip?publisherToken=test-publish-token",
        }),
      } as Response;
    }
    if (requestUrl.includes("/api/telemetry/") || requestUrl.endsWith("/telemetry/")) {
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }
    return {
      ok: true,
      text: async () => "v=0\r\nmock-answer",
    } as Response;
  }) as unknown as typeof fetch;
}

export function createMediaDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: "mock-group",
    kind,
    label,
    toJSON: () => ({ deviceId, groupId: "mock-group", kind, label }),
  };
}
