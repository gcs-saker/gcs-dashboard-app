import { serverHealthText } from "@dashboard/serverStatus";
import type { SystemServiceCard } from "@dashboard/systemStatusViewModel";

interface SystemServiceCardsProps {
  serviceCards: SystemServiceCard[];
}

export function SystemServiceCards({ serviceCards }: SystemServiceCardsProps) {
  return (
    <section className="system-status-page__services" aria-label="서비스 상태 카드">
      {serviceCards.map(([name, description, health]) => (
        <article className={`system-service-card is-${health}`} key={name}>
          <span aria-hidden="true" className={`status-dot is-${health}`} />
          <strong>{name}</strong>
          <em>{serverHealthText(health)}</em>
          <p>{description}</p>
        </article>
      ))}
    </section>
  );
}
