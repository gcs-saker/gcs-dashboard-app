import { useEffect } from "react";
import { motionPolicyForMode, type MotionMode } from "@dashboard/preferences/motionPreference";

export function useDashboardMotionMode(motionMode: MotionMode): void {
  useEffect(() => {
    const policy = motionPolicyForMode(motionMode);
    document.documentElement.dataset.motion = policy.dataMotion;
    document.documentElement.style.setProperty("--gcs-motion-duration", `${policy.animationDurationMs}ms`);
    return () => {
      delete document.documentElement.dataset.motion;
      document.documentElement.style.removeProperty("--gcs-motion-duration");
    };
  }, [motionMode]);
}
