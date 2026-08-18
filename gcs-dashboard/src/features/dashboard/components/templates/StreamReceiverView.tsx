import type { DashboardViewRouterProps } from "./DashboardViewRouter";
import { SelectedStreamPanel } from "@dashboard/components/SelectedStreamPanel";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import { TelemetryPanel } from "@dashboard/components/TelemetryPanel";
import { getDashboardStreamStatusClass, getDashboardStreamStatusText } from "@dashboard/streamTypes";

interface StreamReceiverViewProps {
  readonly currentUsername: string;
  readonly onLogout: () => void;
  readonly receiver: DashboardViewRouterProps;
}

export function StreamReceiverView({ currentUsername, onLogout, receiver }: StreamReceiverViewProps) {
  return (
    <section className="stream-receiver" aria-label="스트림 수신 모니터">
      <header className="stream-receiver__header">
        <span className="stream-receiver__brand"><strong>GCS SAKER</strong><small>STREAM RECEIVER</small></span>
        <span className={`ops-badge ${getDashboardStreamStatusClass(receiver.selectedStream.status)}`}>
          {getDashboardStreamStatusText(receiver.selectedStream.status)}
        </span>
        <span className="stream-receiver__session">{currentUsername}</span>
        <button className="ops-command-button" onClick={onLogout} type="button">로그아웃</button>
      </header>
      <div className="stream-receiver__content">
        <SelectedStreamPanel
          hasAudioActivity={receiver.selectedStream.id === receiver.audioActiveStreamId}
          onPlaybackStatusChange={receiver.onPlaybackStatusChange}
          showAiControl={false}
          stream={receiver.selectedStream}
        />
        <div className="stream-receiver__lower">
          <StreamGrid
            audioActiveStreamId={receiver.audioActiveStreamId}
            onSelectStream={receiver.onSelectStream}
            selectedStreamId={receiver.selectedStreamId}
            streams={receiver.streams}
          />
          <TelemetryPanel
            controls={null}
            isPinned={false}
            rows={receiver.telemetryRows}
            stream={receiver.selectedStream}
            widget={receiver.telemetryWidget}
          />
        </div>
      </div>
    </section>
  );
}
