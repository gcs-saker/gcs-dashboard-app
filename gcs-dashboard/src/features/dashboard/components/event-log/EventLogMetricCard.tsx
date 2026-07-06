export type EventLogMetricTone = "good" | "warning" | "danger" | "muted" | "info";

interface EventLogMetricCardProps {
  label: string;
  tone: EventLogMetricTone;
  value: string;
}

export function EventLogMetricCard({ label, tone, value }: EventLogMetricCardProps) {
  return (
    <span className={`event-log-metric is-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
