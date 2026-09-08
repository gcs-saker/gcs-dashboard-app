import type { OperationalEvent, OperationalEventMetrics, OperationalEventTimeBucket } from "@dashboard/operations/operationalEvents";
import type { StreamRegistryResponse, TelemetryReadResponse } from "@dashboard/assets/streamDevices";
import type { TokenResponse } from "@/features/auth/types";
import type { DashboardMapConfig } from "@/config";

export const MOCK_OPERATOR_TOKEN: TokenResponse = Object.freeze({
  access_token: "mock-access-token",
  token_type: "bearer",
  expires_in_minutes: 30,
  username: "operator01",
  role: "operator",
  group_id: "co-a",
  securityVersion: 1,
  capabilities: {
    canView: true, canControl: true, canManage: false, canSendTalkback: true,
    canPublish: true, canManageMembers: false, canManageDevices: false,
  },
});

export const MOCK_STREAM_REGISTRY: readonly StreamRegistryResponse[] = Object.freeze([
  {
    streamId: "raw.sample.front",
    path: "raw.sample.front",
    status: "online",
    displayName: "DRN-01 전방 EO",
    prefix: "raw",
    assetId: "sample",
    sensorId: "front",
  },
  {
    streamId: "raw.local.webcam",
    path: "raw.local.webcam",
    status: "registered",
    displayName: "로컬 웹캠 테스트",
    prefix: "raw",
    assetId: "local",
    sensorId: "webcam",
  },
]);

export const MOCK_MAP_CONFIG: DashboardMapConfig = Object.freeze({
  provider: "esri-satellite",
  styleUrl: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Esri World Imagery",
  requiresApiKey: false,
});

export const MOCK_TELEMETRY: readonly TelemetryReadResponse[] = Object.freeze([
  {
    uuid: "raw.sample.front",
    latitude: 35.871435,
    longitude: 128.601445,
    altitude: 120,
    velocity: 8.5,
    epochTime: "00:10:23",
  },
  {
    uuid: "raw.local.webcam",
    latitude: 35.8724,
    longitude: 128.6072,
    altitude: 12,
    velocity: 0,
    epochTime: "00:00:02",
  },
]);

export const MOCK_OPERATIONAL_EVENTS: readonly OperationalEvent[] = Object.freeze([
  {
    id: "mock-event-001",
    occurredAt: "2026-06-29T00:00:00Z",
    severity: "info",
    category: "api",
    eventType: "health.ok",
    sourceService: "auth-policy",
    source: "API 서버",
    message: "Mock API health 정상",
    connections: 2,
    latencyMs: 32,
    throughputMbps: 8.2,
    streamId: null,
    connectionId: null,
    icePath: null,
    relayFallbackReason: null,
  },
  {
    id: "mock-event-002",
    occurredAt: "2026-06-29T00:01:00Z",
    severity: "warn",
    category: "network",
    eventType: "ice.relay_fallback",
    sourceService: "media-control",
    source: "Signaling 서버",
    message: "Mock ICE relay fallback 감지",
    connections: 1,
    latencyMs: 118,
    throughputMbps: 18.4,
    streamId: "raw.sample.front",
    connectionId: "mock-conn-001",
    icePath: "relay",
    relayFallbackReason: "srflx candidate failed",
  },
]);

export const MOCK_OPERATIONAL_METRICS: OperationalEventMetrics = {
  totalEvents: 2,
  totalConnections: 3,
  minLatencyMs: 32,
  avgLatencyMs: 75,
  maxLatencyMs: 118,
  avgThroughputMbps: 13.3,
  severityCounts: [
    { severity: "info", count: 1 },
    { severity: "warn", count: 1 },
  ],
  icePathCounts: [
    { icePath: "relay", count: 1 },
  ],
  streamSessions: [
    {
      streamId: "raw.sample.front",
      connectionId: "mock-conn-001",
      lastOccurredAt: "2026-06-29T00:01:00Z",
      eventCount: 1,
      averageLatencyMs: 118,
      averageThroughputMbps: 18.4,
      icePath: "relay",
      relayFallbackReason: "srflx candidate failed",
    },
  ],
};

export const MOCK_OPERATIONAL_BUCKETS: readonly OperationalEventTimeBucket[] = Object.freeze([
  {
    bucketStart: "2026-06-29T00:00:00Z",
    eventCount: 1,
    totalConnections: 2,
    avgLatencyMs: 32,
    avgThroughputMbps: 8.2,
  },
  {
    bucketStart: "2026-06-29T00:01:00Z",
    eventCount: 1,
    totalConnections: 1,
    avgLatencyMs: 118,
    avgThroughputMbps: 18.4,
  },
]);
