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
    expect(screen.getByText("운영 이벤트 타임라인")).toBeInTheDocument();
    expect(screen.getByText("이벤트 상세")).toBeInTheDocument();
    expect(screen.getByText("연결 합계")).toBeInTheDocument();
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
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("latencyMs=164");
    await waitFor(() => expect(screen.queryByText("만료된 세션으로 스트림 접근 거절")).not.toBeInTheDocument());
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/ops/events?severity=warn",
      expect.objectContaining({
        credentials: "include",
        headers: { Accept: "application/json" },
      }),
    );

    await user.selectOptions(screen.getByLabelText("분류"), "network");
    expect((await screen.findAllByText("TURN 릴레이")).length).toBeGreaterThanOrEqual(1);

    await user.selectOptions(screen.getByLabelText("서버"), "TURN 릴레이");
    expect((await screen.findAllByText("직접 ICE 후보 실패 후 릴레이 경로 사용")).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: "초기화" }));
    expect(screen.getByText("전체 이벤트")).toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}
