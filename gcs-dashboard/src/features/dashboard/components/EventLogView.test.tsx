import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createDashboardQueryClient } from "@features/queryClient";
import { AuthProvider } from "@auth/AuthProvider";
import { DEFAULT_OPERATIONAL_EVENT_FILTERS, useEventLogStore } from "@dashboard/stores/useEventLogStore";
import { EventLogView } from "./EventLogView";

const events = [
  {
    id: "evt-001",
    occurredAt: "2026-06-01T00:00:00Z",
    severity: "info",
    category: "api",
    eventType: "health.ok",
    sourceService: "auth-policy",
    source: "API 서버",
    message: "헬스체크 정상",
    connections: 12,
    latencyMs: 42,
    throughputMbps: 18.4,
    streamId: null,
    connectionId: null,
    icePath: null,
    relayFallbackReason: null,
  },
  {
    id: "evt-002",
    occurredAt: "2026-06-01T00:12:00Z",
    severity: "warn",
    category: "network",
    eventType: "ice.relay_fallback",
    sourceService: "turn",
    source: "TURN 릴레이",
    message: "직접 ICE 후보 실패 후 릴레이 경로 사용",
    connections: 5,
    latencyMs: 164,
    throughputMbps: 31.6,
    streamId: "raw/local/webcam",
    connectionId: "conn-whep-001",
    icePath: "relay",
    relayFallbackReason: "srflx candidate failed",
  },
  {
    id: "evt-003",
    occurredAt: "2026-06-01T00:31:00Z",
    severity: "error",
    category: "security",
    eventType: "auth.denied",
    sourceService: "auth-policy",
    source: "인증/인가 서버",
    message: "만료된 세션으로 스트림 접근 거절",
    connections: 0,
    latencyMs: 73,
    throughputMbps: 0,
    streamId: "raw/local/webcam",
    connectionId: "conn-whep-002",
    icePath: null,
    relayFallbackReason: null,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  useEventLogStore.setState({
    filters: DEFAULT_OPERATIONAL_EVENT_FILTERS,
    categoryFilter: "all",
    sourceFilter: "all",
    selectedEventId: null,
  });
});

describe("EventLogView", () => {
  test("renders event filters, operational metrics, and graph rows", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/metrics")) {
        const scopedEvents = url.includes("severity=warn") ? events.filter((event) => event.severity === "warn") : events;
        return jsonResponse(metricPayload(scopedEvents));
      }
      const payload = url.includes("severity=warn") ? events.filter((event) => event.severity === "warn") : events;
      if (url.includes("/page")) {
        return jsonResponse({ events: payload, nextCursor: null });
      }
      return jsonResponse(payload);
    }));

    renderWithQueryClient(<EventLogView />);

    expect(screen.getByLabelText("이벤트로그")).toBeInTheDocument();
    expect(screen.getByLabelText("시간대별 네트워크 지표")).toBeInTheDocument();
    expect(screen.getByText("운영 이벤트 타임라인")).toBeInTheDocument();
    expect(screen.getByText("이벤트 상세")).toBeInTheDocument();
    expect(screen.getByText("연결 합계")).toBeInTheDocument();
    expect(screen.getByText("TURN Relay")).toBeInTheDocument();
    expect(screen.getByText("Direct ICE")).toBeInTheDocument();
    expect(screen.getByText("Stream Sessions")).toBeInTheDocument();
    expect(screen.getByLabelText("분류")).toBeInTheDocument();
    expect(screen.getByLabelText("서버")).toBeInTheDocument();
    expect(screen.getByLabelText("빠른 이벤트 필터")).toBeInTheDocument();
    expect(screen.getByText("전체 이벤트")).toBeInTheDocument();
    expect((await screen.findAllByText("헬스체크 정상")).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "WARN" }));

    expect((await screen.findAllByText("직접 ICE 후보 실패 후 릴레이 경로 사용")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("원인 후보")).toBeInTheDocument();
    expect(screen.getByText("영향 범위")).toBeInTheDocument();
    expect(screen.getByText("권장 조치")).toBeInTheDocument();
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("category=network");
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("icePath=relay");
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("stream=connected");
    expect(screen.getByLabelText("운영 이벤트 원문")).not.toHaveTextContent("raw/local/webcam");
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("latencyMs=164");
    await waitFor(() => expect(screen.queryByText("만료된 세션으로 스트림 접근 거절")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/ops/events/page?severity=warn&limit=50", expect.objectContaining({
      credentials: "include",
      headers: { Accept: "application/json" },
    }));
    expect(fetch).toHaveBeenCalledWith("/api/ops/events/metrics?severity=warn", expect.objectContaining({
      credentials: "include",
      headers: { Accept: "application/json" },
    }));

    await user.selectOptions(screen.getByLabelText("분류"), "network");
    expect((await screen.findAllByText("TURN 릴레이")).length).toBeGreaterThanOrEqual(1);

    await user.selectOptions(screen.getByLabelText("서버"), "TURN 릴레이");
    expect((await screen.findAllByText("직접 ICE 후보 실패 후 릴레이 경로 사용")).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("전체 이벤트")).toBeInTheDocument();
  });
});

function renderWithQueryClient(ui: ReactElement) {
  const client = createDashboardQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  );
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function metricPayload(scopedEvents: typeof events) {
  const latencyValues = scopedEvents.map((event) => event.latencyMs);
  const throughputValues = scopedEvents.map((event) => event.throughputMbps);
  return {
    totalEvents: scopedEvents.length,
    totalConnections: scopedEvents.reduce((total, event) => total + event.connections, 0),
    minLatencyMs: latencyValues.length ? Math.min(...latencyValues) : null,
    avgLatencyMs: latencyValues.length
      ? latencyValues.reduce((total, value) => total + value, 0) / latencyValues.length
      : null,
    maxLatencyMs: latencyValues.length ? Math.max(...latencyValues) : null,
    avgThroughputMbps: throughputValues.length
      ? throughputValues.reduce((total, value) => total + value, 0) / throughputValues.length
      : null,
    severityCounts: ["info", "warn", "error"].map((severity) => ({
      severity,
      count: scopedEvents.filter((event) => event.severity === severity).length,
    })),
    icePathCounts: ["host", "srflx", "relay"].map((icePath) => ({
      icePath,
      count: scopedEvents.filter((event) => event.icePath === icePath).length,
    })),
    streamSessions: scopedEvents
      .filter((event) => event.streamId)
      .map((event) => ({
        streamId: event.streamId,
        connectionId: event.connectionId,
        lastOccurredAt: event.occurredAt,
        eventCount: 1,
        averageLatencyMs: event.latencyMs,
        averageThroughputMbps: event.throughputMbps,
        icePath: event.icePath,
        relayFallbackReason: event.relayFallbackReason,
      })),
  };
}
