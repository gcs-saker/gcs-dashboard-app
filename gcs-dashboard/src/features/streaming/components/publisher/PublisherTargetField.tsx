import { isBusy } from "@streaming/publisher/publisherStatusPresentation";
import type {
  PublisherStreamTarget,
  WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";

interface PublisherTargetFieldProps {
  onStreamTargetChange: (streamId: string) => void;
  selectedStreamTarget: PublisherStreamTarget;
  status: WebcamPublisherStatus;
  streamTargets: PublisherStreamTarget[];
}

export function PublisherTargetField({
  onStreamTargetChange,
  selectedStreamTarget,
  status,
  streamTargets,
}: PublisherTargetFieldProps) {
  return (
    <fieldset className="local-webcam-publisher__field-group" disabled={isBusy(status)}>
      <legend>송출 stream</legend>
      <label>
        대상
        <select
          aria-label="송출 stream 선택"
          onChange={(event) => onStreamTargetChange(event.currentTarget.value)}
          value={selectedStreamTarget.id}
        >
          {streamTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label} / {target.id}
            </option>
          ))}
        </select>
      </label>
      <span>{selectedStreamTarget.whipPath}</span>
    </fieldset>
  );
}
