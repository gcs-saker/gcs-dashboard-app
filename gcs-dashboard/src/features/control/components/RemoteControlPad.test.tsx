import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RemoteControlPad } from "@control/components/RemoteControlPad";

describe("RemoteControlPad", () => {
  test("preserves pointer motion and dead-man stop behavior", () => {
    const onIntent = vi.fn();
    render(<RemoteControlPad enabled onIntent={onIntent} />);

    const forward = screen.getByRole("button", { name: "전진" });
    fireEvent.pointerDown(forward);
    expect(onIntent).toHaveBeenLastCalledWith({
      type: "motion",
      axes: { forward: 1, right: 0, up: 0, yaw: 0 },
    });

    fireEvent.pointerUp(forward);
    expect(onIntent).toHaveBeenLastCalledWith({ type: "stop" });
  });

  test("keeps every control disabled when control is unavailable", () => {
    render(<RemoteControlPad enabled={false} onIntent={vi.fn()} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
