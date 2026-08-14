import "./DashboardPage.scss";
import { DashboardPageView } from "@dashboard/components/templates/DashboardPageView";
import { useDashboardPageController } from "@dashboard/hooks/controller/useDashboardPageController";

export function DashboardPage() {
  const pageProps = useDashboardPageController();
  return <DashboardPageView {...pageProps} />;
}
