import type { StreamAvailabilityNotification } from "@dashboard/hooks/useStreamAvailabilityNotification";

export interface StreamNotificationToastProps {
  notification: StreamAvailabilityNotification;
  onDismiss: () => void;
}

export function StreamNotificationToast({ notification, onDismiss }: StreamNotificationToastProps) {
  return (
    <div className="ops-toast-stack" aria-live="polite">
      <button className="ops-stream-toast" onClick={onDismiss} type="button">
        <span>STREAM</span>
        <strong>{notification.message}</strong>
      </button>
    </div>
  );
}
