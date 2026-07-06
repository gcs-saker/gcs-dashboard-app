import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { EventLogFilters } from "./EventLogFilters";

const BASE_FILTERS = {
  from: "2026-06-29T00:00",
  query: "",
  severity: "all" as const,
  to: "2026-06-29T01:00",
};

describe("EventLogFilters", () => {
  test("patches text, severity, and time filters through one callback contract", async () => {
    const user = userEvent.setup();
    const onPatchFilters = vi.fn();

    render(
      <EventLogFilters
        categoryFilter="all"
        filters={BASE_FILTERS}
        onCategoryFilterChange={vi.fn()}
        onPatchFilters={onPatchFilters}
        onSourceFilterChange={vi.fn()}
        sourceFilter="all"
        sourceOptions={["API 서버"]}
      />,
    );

    await user.type(screen.getByLabelText("내용"), "relay");
    await user.selectOptions(screen.getByLabelText("강도"), "warn");
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "2026-06-29T02:30" } });

    expect(onPatchFilters).toHaveBeenCalledWith({ query: "r" });
    expect(onPatchFilters).toHaveBeenCalledWith({ severity: "warn" });
    expect(onPatchFilters).toHaveBeenLastCalledWith({ from: "2026-06-29T02:30" });
  });

  test("routes category and source changes to dedicated callbacks", async () => {
    const user = userEvent.setup();
    const onCategoryFilterChange = vi.fn();
    const onSourceFilterChange = vi.fn();

    render(
      <EventLogFilters
        categoryFilter="all"
        filters={BASE_FILTERS}
        onCategoryFilterChange={onCategoryFilterChange}
        onPatchFilters={vi.fn()}
        onSourceFilterChange={onSourceFilterChange}
        sourceFilter="all"
        sourceOptions={["API 서버", "Signaling 서버"]}
      />,
    );

    await user.selectOptions(screen.getByLabelText("분류"), "network");
    await user.selectOptions(screen.getByLabelText("서버"), "Signaling 서버");

    expect(onCategoryFilterChange).toHaveBeenCalledWith("network");
    expect(onSourceFilterChange).toHaveBeenCalledWith("Signaling 서버");
  });
});
