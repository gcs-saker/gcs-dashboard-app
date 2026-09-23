import { useCallback, useEffect, useRef } from "react";

export interface MotionAxes { forward: number; right: number; up: number; yaw: number }
export type ControlIntent = { type: "motion"; axes: MotionAxes } | { type: "stop" };

const KEY_AXES: Record<string, Partial<MotionAxes>> = {
  w: { forward: 1 }, s: { forward: -1 }, a: { right: -1 }, d: { right: 1 },
};

export function useDeadManControl(enabled: boolean, send: (intent: ControlIntent) => void) {
  const pressedRef = useRef(new Set<string>());
  const sendRef = useRef(send);
  sendRef.current = send;

  const releaseAll = useCallback(() => {
    if (pressedRef.current.size === 0) return;
    pressedRef.current.clear();
    sendRef.current({ type: "stop" });
  }, []);

  const press = useCallback((key: string) => {
    const normalized = key.toLowerCase();
    if (!enabled || !KEY_AXES[normalized] || pressedRef.current.has(normalized)) return;
    pressedRef.current.add(normalized);
    sendRef.current({ type: "motion", axes: axesFor(pressedRef.current) });
  }, [enabled]);

  const release = useCallback((key: string) => {
    const normalized = key.toLowerCase();
    if (!pressedRef.current.delete(normalized)) return;
    const axes = axesFor(pressedRef.current);
    sendRef.current(isStopped(axes) ? { type: "stop" } : { type: "motion", axes });
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (KEY_AXES[event.key.toLowerCase()]) event.preventDefault();
      press(event.key);
    };
    const keyup = (event: KeyboardEvent) => release(event.key);
    const visibility = () => { if (document.visibilityState === "hidden") releaseAll(); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      releaseAll();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [press, release, releaseAll]);

  return { press, release, stop: releaseAll };
}

function axesFor(keys: Set<string>): MotionAxes {
  const axes: MotionAxes = { forward: 0, right: 0, up: 0, yaw: 0 };
  for (const key of keys) for (const [axis, value] of Object.entries(KEY_AXES[key])) axes[axis as keyof MotionAxes] += value ?? 0;
  return axes;
}

function isStopped(axes: MotionAxes): boolean { return Object.values(axes).every((value) => value === 0); }

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}
