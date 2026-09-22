import { useCallback, useEffect, useRef, useState } from "react";
import type { UserRole } from "./types";

export const ADMIN_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const USER_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "touchstart", "wheel"] as const;

interface IdleSessionControl {
  extendSession: () => void;
  warningSeconds: number | null;
}

export function idleTimeoutForRole(role: UserRole): number {
  return role === "admin" ? ADMIN_IDLE_TIMEOUT_MS : USER_IDLE_TIMEOUT_MS;
}

export function useIdleSessionTimeout(
  enabled: boolean,
  role: UserRole | null,
  onIdle: () => void,
): IdleSessionControl {
  const lastActivityMsRef = useRef(Date.now());
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const extendSession = useCallback(() => {
    lastActivityMsRef.current = Date.now();
    setWarningSeconds(null);
  }, []);
  useEffect(() => {
    if (!enabled || role === null) {
      setWarningSeconds(null);
      return;
    }
    extendSession();
    const intervalId = window.setInterval(() => {
      if (role !== "admin" && hasForegroundOperationalMedia()) extendSession();
      const remainingMs = idleTimeoutForRole(role) - (Date.now() - lastActivityMsRef.current);
      if (remainingMs <= 0) onIdle();
      else if (remainingMs <= IDLE_WARNING_MS) setWarningSeconds(Math.ceil(remainingMs / 1000));
      else setWarningSeconds(null);
    }, 1000);
    for (const eventName of ACTIVITY_EVENTS) document.addEventListener(eventName, extendSession, { passive: true });
    return () => {
      window.clearInterval(intervalId);
      for (const eventName of ACTIVITY_EVENTS) document.removeEventListener(eventName, extendSession);
    };
  }, [enabled, extendSession, onIdle, role]);
  return { extendSession, warningSeconds };
}

export function hasForegroundOperationalMedia(): boolean {
  if (document.visibilityState !== "visible") return false;
  return Array.from(document.querySelectorAll("video, audio")).some((element) => {
    const media = element as HTMLMediaElement;
    return !media.paused && !media.ended && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  });
}
