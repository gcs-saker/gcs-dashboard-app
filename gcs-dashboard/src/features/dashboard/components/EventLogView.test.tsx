import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { EventLogView } from "./EventLogView";

const events = [
  {
    id: "evt-001",
    occurredAt: "2026-06-01T00:00:00Z",
    severity: "info",
    category: "api",
    source: "API 서버",
    message: "헬스체크 정상",
    connections: 12,
    latencyMs: 42,
    throughputMbps: 18.4,
  },
  {
    id: "evt-002",
    occurredAt: "2026-06-01T00:12:00Z",
    severity: "warn",
    category: "network",
    source: "TURN 릴레이",
    message: "직접 ICE 후보 실패 후 릴레이 경로 사용",
    connections: 5,
    latencyMs: 164,
    throughputMbps: 31.6,
  },
  {
    id: "evt-003",
    occurredAt: "2026-06-01T00:31:00Z",
    severity: "error",
    category: "security",
    source: "인증/인가 서버",
    message: "만료된 세션으로 스트림 접근 거절",
    connections: 0,
    latencyMs: 73,
    throughputMbps: 0,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EventLogView", () => {
  test("renders event filters, operational metrics, and graph rows", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("severity=warn") ? events.filter((event) => event.severity === "warn") : events;
      return jsonResponse(payload);
    }));

    render(<EventLogView />);

    expect(screen.getByLabelText("이벤트로그")).toBeInTheDocument();
    expect(screen.getByLabelText("시간대별 네트워크 지표")).toBeInTheDocument();
    expect(screen.getByText(/Connections/)).toBeInTheDocument();
    expect(await screen.findByText("헬스체크 정상")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("강도"), "warn");

    expect(await screen.findByText("직접 ICE 후보 실패 후 릴레이 경로 사용")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("만료된 세션으로 스트림 접근 거절")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/ops/events?severity=warn",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
