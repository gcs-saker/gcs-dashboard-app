import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { DashboardMvp } from "./DashboardMvp";

describe("DashboardMvp", () => {
  test("renders the field operations dashboard regions from the M2 MVP", () => {
    render(<DashboardMvp />);

    expect(screen.getByRole("main", { name: "Field Ops Dashboard MVP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "자산트리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버상태 / 연결상태 / 헬스체크" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지오메트리 / 텔레메트리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 결과" })).toBeInTheDocument();
  });

  test("shows all MVP stream slots and changes the selected stream", async () => {
    const user = userEvent.setup();
    render(<DashboardMvp />);

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 2 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 3 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 4 선택" })).toBeInTheDocument();
    expect(screen.getAllByText("전방 EO / raw.sample.front")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "스트리밍 3 선택" }));

    expect(screen.getAllByText("AI 감지 overlay / raw.sample.rear")).toHaveLength(2);
  });

  test("renders operational status placeholders needed before live backend wiring", () => {
    render(<DashboardMvp />);

    expect(screen.getByText("GCS-SAKER")).toBeInTheDocument();
    expect(screen.getByText("서버상태")).toBeInTheDocument();
    expect(screen.getByText("연결 자산")).toBeInTheDocument();
    expect(screen.getByText("탐지")).toBeInTheDocument();
    expect(screen.getByText("처리 지연")).toBeInTheDocument();
  });
});
