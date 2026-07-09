import "./DashboardPage.scss";
import { DashboardPageView } from "./components/templates/DashboardPageView";
import { useDashboardPageController } from "./hooks/useDashboardPageController";

export function DashboardPage() {
  const pageProps = useDashboardPageController();
  return <DashboardPageView {...pageProps} />;
}
