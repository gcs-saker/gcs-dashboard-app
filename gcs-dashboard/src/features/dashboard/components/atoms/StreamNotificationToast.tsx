import type { StreamAvailabilityNotification } from "@dashboard/hooks/useStreamAvailabilityNotification";

export interface StreamNotificationToastProps {
  notification: StreamAvailabilityNotification;
  onDismiss: () => void;
  onOpen: (streamId: string) => void;
}

export function StreamNotificationToast({ notification, onDismiss, onOpen }: StreamNotificationToastProps) {
  return (
    <div className="ops-toast-stack" aria-live="polite">
      <button className="ops-stream-toast" onClick={() => onOpen(notification.streamId)} type="button">
        <span>STREAM</span>
        <strong>{notification.message}</strong>
        <span>보기</span>
      </button>
      <button
        aria-label="스트림 알림 닫기"
        className="ops-stream-toast__dismiss"
        onClick={onDismiss}
        type="button"
      >
        닫기
      </button>
    </div>
  );
}
