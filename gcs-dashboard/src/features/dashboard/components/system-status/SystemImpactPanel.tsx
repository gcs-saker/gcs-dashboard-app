import { serverHealthText, type DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import type { SystemImpactItem } from "@dashboard/operations/systemStatusViewModel";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";

interface SystemImpactPanelProps {
  impactItems: SystemImpactItem[];
  status: DashboardServerStatusSnapshot;
}

export function SystemImpactPanel({ impactItems, status }: SystemImpactPanelProps) {
  return (
    <section className="ops-panel system-status-page__impact" aria-label="장애 영향 범위">
      <div className="ops-panel__header">
        <h2>장애 영향 범위</h2>
        <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
          {serverHealthText(status.readiness)}
        </span>
      </div>
      <ul className="system-impact-list">
        {impactItems.map(([name, health, description]) => (
          <li className={`is-${health}`} key={name}>
            <span aria-hidden="true" className={`status-dot is-${health}`} />
            <strong>{name}</strong>
            <em>{serverHealthText(health)}</em>
            <p>{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
