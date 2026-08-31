import type { OperationalEvent } from "@dashboard/operations/operationalEvents";

interface EventLogIncidentStripProps {
  incidents: OperationalEvent[];
}

export function EventLogIncidentStrip({ incidents }: EventLogIncidentStripProps) {
  return (
    <section className="event-log-view__incident-strip" aria-label="현재 주의 이벤트">
      <div>
        <span>현재 장애 / 주의</span>
        <strong>{incidents.length ? `${incidents.length}건 확인 필요` : "중요 이벤트 없음"}</strong>
      </div>
      {incidents.length ? (
        <ul>
          {incidents.map((event) => (
            <li className={`is-${event.severity}`} key={event.id}>
              <span>{event.severity.toUpperCase()}</span>
              <strong>{event.source}</strong>
              <em>{event.message}</em>
            </li>
          ))}
        </ul>
      ) : (
        <p>WARN/ERROR 이벤트가 없습니다. 운영 추세만 모니터링하면 됩니다.</p>
      )}
    </section>
  );
}
