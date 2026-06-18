import { useEffect, useRef, useState } from "react";

export function useRafNumber(value: number, isEnabled: boolean): number {
  const frameRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);
  const [committedValue, setCommittedValue] = useState(value);

  useEffect(() => {
    latestValueRef.current = value;
    if (!isEnabled || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      setCommittedValue(value);
      return;
    }

    if (frameRef.current !== null) return;

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setCommittedValue((current) => (current === latestValueRef.current ? current : latestValueRef.current));
    });

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isEnabled, value]);

  return committedValue;
}
