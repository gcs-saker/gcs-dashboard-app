import { isBusy } from "@streaming/publisher/publisherStatusPresentation";
import type { WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";

interface PublisherActionButtonsProps {
  onPublish: () => void;
  onStartPreview: () => void;
  onStop: () => void;
  status: WebcamPublisherStatus;
}

export function PublisherActionButtons({
  onPublish,
  onStartPreview,
  onStop,
  status,
}: PublisherActionButtonsProps) {
  return (
    <div className="local-webcam-publisher__controls">
      <button type="button" onClick={onStartPreview} disabled={isBusy(status) || status === "published"}>
        카메라 준비
      </button>
      <button type="button" onClick={onPublish} disabled={status !== "previewing"}>
        시그널링 시작
      </button>
      <button type="button" onClick={onStop}>
        중지
      </button>
    </div>
  );
}
