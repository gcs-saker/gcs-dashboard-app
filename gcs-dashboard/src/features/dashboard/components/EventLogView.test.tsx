import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { EventLogView } from "./EventLogView";

describe("EventLogView", () => {
  test("renders event filters, operational metrics, and graph rows", async () => {
    const user = userEvent.setup();
    render(<EventLogView />);

    expect(screen.getByLabelText("이벤트로그")).toBeInTheDocument();
    expect(screen.getByLabelText("시간대별 네트워크 지표")).toBeInTheDocument();
    expect(screen.getByText(/Connections/)).toBeInTheDocument();
    expect(screen.getByText("송출 종료 감지")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("강도"), "warn");

    expect(screen.getByText("직접 ICE 후보 실패 후 릴레이 경로 사용")).toBeInTheDocument();
    expect(screen.queryByText("만료된 세션으로 스트림 접근 거절")).not.toBeInTheDocument();
  });
});
