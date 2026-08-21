import "./DashboardPage.scss";
import { DashboardPageView } from "@dashboard/components/templates/DashboardPageView";
import { useDashboardPageController } from "@dashboard/hooks/controller/useDashboardPageController";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

interface DashboardPageProps {
  readonly initialStreams?: DashboardStreamSlot[];
}

export function DashboardPage({ initialStreams }: DashboardPageProps = {}) {
  const pageProps = useDashboardPageController({ initialStreams });
  return <DashboardPageView {...pageProps} />;
}
