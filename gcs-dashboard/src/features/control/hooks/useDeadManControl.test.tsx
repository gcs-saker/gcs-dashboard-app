import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ControlIntent } from "@control/contracts/controlIntent";
import { useDeadManControl } from "@control/hooks/useDeadManControl";

describe("useDeadManControl", () => {
  test("maps WASD and sends stop on final key release", () => {
    const intents: ControlIntent[] = [];
    renderHook(() => useDeadManControl(true, (intent) => intents.push(intent)));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", cancelable: true })));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", cancelable: true })));
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" })));
    act(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: "d" })));
    expect(intents.at(-1)).toEqual({ type: "stop" });
    expect(intents[1]).toMatchObject({ type: "motion", axes: { forward: 1, right: 1 } });
  });

  test("blur and unmount apply dead-man stop", () => {
    const send = vi.fn();
    const { unmount } = renderHook(() => useDeadManControl(true, send));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" })));
    act(() => window.dispatchEvent(new Event("blur")));
    expect(send).toHaveBeenLastCalledWith({ type: "stop" });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })));
    unmount();
    expect(send).toHaveBeenLastCalledWith({ type: "stop" });
  });

  test("does not capture keys from editable fields", () => {
    const send = vi.fn();
    renderHook(() => useDeadManControl(true, send));
    const input = document.createElement("input");
    document.body.append(input);
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true })));
    expect(send).not.toHaveBeenCalled();
    input.remove();
  });
});
