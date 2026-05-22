import { RealtimePlayer } from "./RealtimePlayer";

const DEFAULT_SMOKE_STREAM_ID = "raw.sample.front";

export function StreamingSmokeDashboard() {
  return (
    <main className="streaming-smoke-dashboard" aria-label="Streaming E2E smoke">
      <RealtimePlayer streamId={DEFAULT_SMOKE_STREAM_ID} title="Streaming E2E smoke" />
    </main>
  );
}

export default StreamingSmokeDashboard;
