import { afterEach, beforeEach, vi } from "vitest";

export class MockPeerConnection {
  addTransceiver = vi.fn();
  close = vi.fn(() => {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  });
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "mock-offer-sdp" }) as RTCSessionDescriptionInit);
  getStats = vi.fn(async () => this.statsReport as unknown as RTCStatsReport);
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
  });
  setRemoteDescription = vi.fn();

  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  iceGatheringState: RTCIceGatheringState;
  localDescription: RTCSessionDescription | null = null;
  statsReport = new Map<string, Record<string, unknown>>();
  onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown) | null = null;
  onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => unknown) | null = null;

  constructor() {
    this.iceGatheringState = initialIceGatheringState;
  }

  emitConnectionState(
    connectionState: RTCPeerConnectionState,
    iceConnectionState: RTCIceConnectionState = "connected",
  ) {
    this.connectionState = connectionState;
    this.iceConnectionState = iceConnectionState;
    this.onconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("connectionstatechange"));
  }

  emitIceConnectionState(iceConnectionState: RTCIceConnectionState) {
    this.iceConnectionState = iceConnectionState;
    this.oniceconnectionstatechange?.call(this as unknown as RTCPeerConnection, new Event("iceconnectionstatechange"));
  }

  emitIceCandidate(candidate: Partial<RTCIceCandidate>) {
    this.onicecandidate?.call(this as unknown as RTCPeerConnection, {
      candidate,
    } as RTCPeerConnectionIceEvent);
  }

  emitIceGatheringComplete() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.call(this as unknown as RTCPeerConnection, new Event("icegatheringstatechange"));
  }

  emitRemoteTrack(streams: MediaStream[]) {
    this.ontrack?.call(this as unknown as RTCPeerConnection, {
      streams,
      track: { id: "video-track-1" },
    } as unknown as RTCTrackEvent);
  }

  setStats(stats: Array<Record<string, unknown>>) {
    this.statsReport = new Map(stats.map((stat) => [String(stat.id), stat]));
  }
}

export let peerConnections: MockPeerConnection[] = [];
let initialIceGatheringState: RTCIceGatheringState = "complete";

export const successfulWhepResponse = {
  ok: true,
  status: 201,
  text: vi.fn(async () => "mock-answer-sdp"),
};

export function setInitialIceGatheringState(state: RTCIceGatheringState) {
  initialIceGatheringState = state;
}

beforeEach(() => {
  peerConnections = [];
  initialIceGatheringState = "complete";
  vi.stubGlobal(
    "RTCPeerConnection",
    vi.fn(function MockRTCPeerConnectionConstructor() {
      const peerConnection = new MockPeerConnection();
      peerConnections.push(peerConnection);
      return peerConnection;
    }),
  );
  vi.stubGlobal("fetch", vi.fn(async () => successfulWhepResponse));
  vi.stubGlobal(
    "MediaStream",
    vi.fn(function MockMediaStream() {
      return {
        addTrack: vi.fn(),
      };
    }),
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

