import { describe, expect, test, vi } from "vitest";
import { AuthApiError } from "@auth/authApi";
import { DEFAULT_DASHBOARD_STREAMS } from "./streamTypes";
import {
  connectDeviceToStreamSlot,
  createManualStreamDeviceOption,
  disconnectStreamSlot,
  buildTelemetryHistoryPath,
  fetchTelemetryHistory,
  fetchTelemetryIndex,
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  MOCK_STREAM_DEVICES,
  normalizeStreamAddress,
  preferredSelectedStreamId,
} from "./streamDevices";

describe("streamDevices", () => {
  test("connects a registry device to a stream slot", () => {
    const connected = connectDeviceToStreamSlot(DEFAULT_DASHBOARD_STREAMS[3], MOCK_STREAM_DEVICES[0]);

    expect(connected.connectedDeviceId).toBe("device-drn-01-front");
    expect(connected.streamPath).toBe("raw.sample.front");
    expect(connected.status).toBe("online");
    expect(connected.detail).toBe("DRN-01 전방 EO / raw.sample.front");
    expect(connected.geometry?.fovDeg).toBe(72);
  });

  test("normalizes manual WebRTC/HLS addresses into stream paths", () => {
    expect(normalizeStreamAddress("raw.local.webcam")).toBe("raw.local.webcam");
    expect(normalizeStreamAddress("/webrtc/raw/local/webcam/whep")).toBe("raw.local.webcam");
    expect(normalizeStreamAddress("https://a4ai.tplinkdns.com/hls/raw/local/webcam/index.m3u8")).toBe("raw.local.webcam");
  });

  test("creates a manual device option with a remembered source URL", () => {
    const device = createManualStreamDeviceOption(
      "https://a4ai.tplinkdns.com/webrtc/raw/local/webcam/whep",
      "휴대폰 후면 카메라",
      "CCTV 01",
    );

    expect(device).toMatchObject({
      id: "manual-raw.local.webcam",
      name: "휴대폰 후면 카메라",
      streamPath: "raw.local.webcam",
      sourceUrl: "https://a4ai.tplinkdns.com/webrtc/raw/local/webcam/whep",
      status: "degraded",
    });
  });

  test("disconnects a stream slot without removing the slot itself", () => {
    const connected = connectDeviceToStreamSlot(DEFAULT_DASHBOARD_STREAMS[3], MOCK_STREAM_DEVICES[0]);
    const disconnected = disconnectStreamSlot(connected);

    expect(disconnected.id).toBe(DEFAULT_DASHBOARD_STREAMS[3].id);
    expect(disconnected.connectedDeviceId).toBeNull();
    expect(disconnected.streamPath).toBeNull();
    expect(disconnected.geometry).toBeNull();
    expect(disconnected.status).toBe("offline");
  });

  test("fetches live stream devices from the backend registry", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            streamId: "raw.drone-07.front",
            path: "raw/drone-07/front",
            prefix: "raw",
            assetId: "drone-07",
            sensorId: "front",
            status: "online",
            displayName: "Drone 07 Front",
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            uuid: "raw.drone-07.front",
            latitude: 35.8842,
            longitude: 128.6123,
            altitude: 81,
            velocity: 3,
            epochTime: "00:00:10",
          },
        ]),
      );

    const devices = await fetchStreamDeviceOptions(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/media-control/api/v1/streams", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/telemetry/all", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(devices[0]).toMatchObject({
      id: "registry-raw.drone-07.front",
      name: "Drone 07 Front",
      streamPath: "raw.drone-07.front",
      status: "online",
      geometry: {
        lat: 35.8842,
        lng: 128.6123,
        altitudeM: 81,
        source: "telemetry",
      },
    });
  });

  test("indexes telemetry by uuid for map geometry updates", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json([
        {
          uuid: "raw.local.webcam",
          latitude: 35.9,
          longitude: 128.62,
          altitude: 24,
          velocity: 0,
          epochTime: "00:01:00",
        },
      ]),
    );

    const telemetry = await fetchTelemetryIndex(fetcher as unknown as typeof fetch);

    expect(telemetry.get("raw.local.webcam")).toMatchObject({
      latitude: 35.9,
      longitude: 128.62,
    });
  });

  test("fetches telemetry history for selected stream paths", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json([
        {
          recordedAt: "2026-06-01T00:00:00Z",
          telemetry: {
            uuid: "raw/local/webcam",
            latitude: 35.9,
            longitude: 128.62,
            altitude: 24,
            velocity: 0,
            epochTime: "00:01:00",
          },
        },
      ]),
    );

    const history = await fetchTelemetryHistory("raw/local/webcam", 25, fetcher as unknown as typeof fetch);

    expect(buildTelemetryHistoryPath("raw/local/webcam", 25)).toBe("/telemetry/raw%2Flocal%2Fwebcam/history?limit=25");
    expect(fetcher).toHaveBeenCalledWith("/api/telemetry/raw%2Flocal%2Fwebcam/history?limit=25", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(history[0].telemetry.latitude).toBe(35.9);
  });

  test("surfaces stream registry 401 as an auth failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(new Response("refresh unauthorized", { status: 401 }));

    await expect(fetchStreamDeviceOptions(fetcher as unknown as typeof fetch)).rejects.toMatchObject({
      status: 401,
      name: "AuthApiError",
    } satisfies Partial<AuthApiError>);
  });

  test("rejects malformed stream registry payload before it reaches dashboard state", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json([{ streamId: "raw.bad.front", status: "debug" }]))
      .mockResolvedValueOnce(Response.json([]));

    await expect(fetchStreamDeviceOptions(fetcher as unknown as typeof fetch)).rejects.toThrow(
      "stream registry response is invalid",
    );
  });

  test("keeps default and mock stream coordinates in the Daegu operating area", () => {
    const geometries = [
      ...DEFAULT_DASHBOARD_STREAMS.map((stream) => stream.geometry),
      ...MOCK_STREAM_DEVICES.map((device) => device.geometry),
    ].filter(Boolean);

    for (const geometry of geometries) {
      expect(geometry?.lat).toBeGreaterThan(35.8);
      expect(geometry?.lat).toBeLessThan(35.95);
      expect(geometry?.lng).toBeGreaterThan(128.5);
      expect(geometry?.lng).toBeLessThan(128.7);
    }
  });

  test("merges newly discovered backend streams into dashboard slots", () => {
    const firstDevice = MOCK_STREAM_DEVICES[0];
    const baseStreams = [
      {
        id: firstDevice.streamPath,
        title: "스트리밍 1",
        status: firstDevice.status,
        mode: "EO" as const,
        detail: firstDevice.name,
        connectedDeviceId: firstDevice.id,
        streamPath: firstDevice.streamPath,
        geometry: firstDevice.geometry,
      },
    ];

    const merged = mergeStreamSlotsWithDevices(baseStreams, [
      firstDevice,
      {
        ...firstDevice,
        id: "registry-raw.drone-09.front",
        name: "Drone 09 Front",
        streamPath: "raw.drone-09.front",
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "raw.drone-09.front",
      title: "스트리밍 2",
      detail: "Drone 09 Front / raw.drone-09.front",
    });
  });

  test("updates an existing stream slot when live telemetry geometry arrives", () => {
    const liveWebcamDevice = {
      ...MOCK_STREAM_DEVICES[3],
      status: "online" as const,
      geometry: {
        ...MOCK_STREAM_DEVICES[3].geometry,
        lat: 35.91,
        lng: 128.63,
        altitudeM: 30,
        source: "telemetry" as const,
      },
    };

    const merged = mergeStreamSlotsWithDevices(DEFAULT_DASHBOARD_STREAMS, [liveWebcamDevice]);
    const webcam = merged.find((stream) => stream.streamPath === "raw.local.webcam");

    expect(webcam?.geometry).toMatchObject({
      lat: 35.91,
      lng: 128.63,
      source: "telemetry",
    });
  });

  test("marks connected stream slots offline when registry polling returns no devices", () => {
    const merged = mergeStreamSlotsWithDevices(DEFAULT_DASHBOARD_STREAMS, []);

    expect(merged).toHaveLength(DEFAULT_DASHBOARD_STREAMS.length);
    expect(merged.every((stream) => stream.status === "offline")).toBe(true);
  });

  test("does not append duplicate stream slots across registry polling", () => {
    const firstMerge = mergeStreamSlotsWithDevices(DEFAULT_DASHBOARD_STREAMS, [
      {
        ...MOCK_STREAM_DEVICES[3],
        status: "online",
      },
    ]);
    const secondMerge = mergeStreamSlotsWithDevices(firstMerge, [
      {
        ...MOCK_STREAM_DEVICES[3],
        id: "registry-raw.local.webcam-duplicate",
        status: "online",
      },
    ]);

    expect(secondMerge.filter((stream) => stream.streamPath === "raw.local.webcam")).toHaveLength(1);
    expect(secondMerge).toHaveLength(firstMerge.length);
  });

  test("prefers the live local webcam stream when the selected sample stream is not in the registry", () => {
    const liveWebcamDevice = {
      ...MOCK_STREAM_DEVICES[3],
      status: "online" as const,
    };
    const merged = mergeStreamSlotsWithDevices(DEFAULT_DASHBOARD_STREAMS, [liveWebcamDevice]);

    expect(preferredSelectedStreamId("raw.sample.front", merged, [liveWebcamDevice])).toBe("raw.local.webcam");
  });

  test("keeps the current selection when that stream is online in the registry", () => {
    const liveSampleDevice = {
      ...MOCK_STREAM_DEVICES[0],
      status: "online" as const,
    };
    const liveWebcamDevice = {
      ...MOCK_STREAM_DEVICES[3],
      status: "online" as const,
    };

    expect(
      preferredSelectedStreamId("raw.sample.front", DEFAULT_DASHBOARD_STREAMS, [liveSampleDevice, liveWebcamDevice]),
    ).toBe("raw.sample.front");
  });
});
