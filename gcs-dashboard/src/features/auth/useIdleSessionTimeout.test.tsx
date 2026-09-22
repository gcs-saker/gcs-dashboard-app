import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ADMIN_IDLE_TIMEOUT_MS, USER_IDLE_TIMEOUT_MS, idleTimeoutForRole, useIdleSessionTimeout } from "./useIdleSessionTimeout";

describe("useIdleSessionTimeout", () => {
  afterEach(() => vi.useRealTimers());

  test("applies the shorter administrator timeout", () => {
    expect(idleTimeoutForRole("admin")).toBe(ADMIN_IDLE_TIMEOUT_MS);
    expect(idleTimeoutForRole("operator")).toBe(USER_IDLE_TIMEOUT_MS);
  });

  test("logs out an administrator after ten minutes without user activity", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdleSessionTimeout(true, "admin", onIdle));
    act(() => vi.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS));
    expect(onIdle).toHaveBeenCalledOnce();
  });

  test("warns one minute before expiry and supports explicit extension", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const { result } = renderHook(() => useIdleSessionTimeout(true, "admin", onIdle));
    act(() => vi.advanceTimersByTime(ADMIN_IDLE_TIMEOUT_MS - 60_000));
    expect(result.current.warningSeconds).toBe(60);
    act(() => result.current.extendSession());
    expect(result.current.warningSeconds).toBeNull();
    act(() => vi.advanceTimersByTime(60_000));
    expect(onIdle).not.toHaveBeenCalled();
  });

  test("real user input resets the timeout", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdleSessionTimeout(true, "viewer", onIdle));
    act(() => vi.advanceTimersByTime(USER_IDLE_TIMEOUT_MS - 1000));
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" })));
    act(() => vi.advanceTimersByTime(1000));
    expect(onIdle).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(USER_IDLE_TIMEOUT_MS - 1000));
    expect(onIdle).toHaveBeenCalledOnce();
  });

  test("foreground operational media keeps a non-administrator session active", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const video = document.createElement("video");
    Object.defineProperties(video, {
      paused: { configurable: true, value: false },
      ended: { configurable: true, value: false },
      readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
    });
    document.body.append(video);
    renderHook(() => useIdleSessionTimeout(true, "operator", onIdle));

    act(() => vi.advanceTimersByTime(USER_IDLE_TIMEOUT_MS));
    expect(onIdle).not.toHaveBeenCalled();
    Object.defineProperty(video, "paused", { configurable: true, value: true });
    act(() => vi.advanceTimersByTime(USER_IDLE_TIMEOUT_MS));
    expect(onIdle).toHaveBeenCalledOnce();
    video.remove();
  });
});
