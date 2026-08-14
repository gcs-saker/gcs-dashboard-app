import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { OperationalEvent } from "@dashboard/operations/operationalEvents";
import { EventLogDetailPanel } from "./EventLogDetailPanel";
import { EventLogNetworkPanel, formatNetworkFlowTime } from "./EventLogNetworkPanel";
import { TimelineEventRow } from "./TimelineEventRow";

const BASE_EVENT: OperationalEvent = {
  id: "evt-001",
  occurredAt: "2026-06-29T00:01:00Z",
  severity: "warn",
  category: "network",
  eventType: "ice.relay_fallback",
  sourceService: "media-control",
  source: "Signaling 서버",
  message: "TURN fallback 감지",
  connections: 3,
  latencyMs: 420,
  throughputMbps: 12.4,
  streamId: "raw.sample.front",
  connectionId: "conn-001",
  icePath: "relay",
  relayFallbackReason: "symmetric-nat",
};

function event(overrides: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    ...BASE_EVENT,
    ...overrides,
  };
}

describe("event log panels", () => {
  test("renders an empty detail state when no event is selected", () => {
    render(
      <EventLogDetailPanel
        event={null}
        onCategoryFilterChange={vi.fn()}
        onSourceFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("이벤트 상세")).toHaveTextContent("표시할 이벤트가 없습니다.");
  });

  test("renders event diagnosis and wires detail filter actions", async () => {
    const user = userEvent.setup();
    const onCategoryFilterChange = vi.fn();
    const onSourceFilterChange = vi.fn();

    render(
      <EventLogDetailPanel
        event={BASE_EVENT}
        onCategoryFilterChange={onCategoryFilterChange}
        onSourceFilterChange={onSourceFilterChange}
      />,
    );

    expect(screen.getByText("TURN fallback 감지")).toBeInTheDocument();
    expect(screen.getByText("원인 후보")).toBeInTheDocument();
    expect(screen.getByLabelText("운영 이벤트 원문")).toHaveTextContent("icePath=relay");

    await user.click(screen.getByRole("button", { name: "이 서버만 보기" }));
    await user.click(screen.getByRole("button", { name: "이 분류만 보기" }));

    expect(onSourceFilterChange).toHaveBeenCalledWith("Signaling 서버");
    expect(onCategoryFilterChange).toHaveBeenCalledWith("network");
  });

  test("renders network bars and category filters with selected state", async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    const onCategoryFilterChange = vi.fn();

    render(
      <EventLogNetworkPanel
        categoryFilter="network"
        categoryStats={[
          { category: "api", count: 1 },
          { category: "network", count: 2 },
        ]}
        eventsCount={3}
        networkFlowEvents={[
          BASE_EVENT,
          event({ id: "evt-002", severity: "error", source: "API 서버", message: "ready 실패", throughputMbps: 6.2 }),
        ]}
        onCategoryFilterChange={onCategoryFilterChange}
        onSelectEvent={onSelectEvent}
        peakThroughput={12.4}
        selectedEventId="evt-001"
      />,
    );

    const chart = screen.getByLabelText("시간대별 네트워크 지표");
    expect(within(chart).getByText("최근 2/3 events")).toBeInTheDocument();
    expect(within(chart).getAllByText(formatNetworkFlowTime(BASE_EVENT.occurredAt))).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Signaling 서버 TURN fallback 감지" })).toHaveClass("is-selected");
    expect(screen.getByRole("button", { name: "Network 2" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "API 서버 ready 실패" }));
    await user.click(screen.getByRole("button", { name: "API 1" }));

    expect(onSelectEvent).toHaveBeenCalledWith("evt-002");
    expect(onCategoryFilterChange).toHaveBeenCalledWith("api");
  });

  test("renders timeline row as selectable option", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<TimelineEventRow event={BASE_EVENT} isSelected={true} onSelect={onSelect} />);

    const row = screen.getByRole("option", { selected: true });
    expect(row).toHaveTextContent("Signaling 서버");
    expect(row).toHaveTextContent("Network · RTT 420 ms · 연결 3");

    await user.click(row);

    expect(onSelect).toHaveBeenCalledWith("evt-001");
  });
});
