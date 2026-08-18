export type DashboardRouteMode = "operations" | "receiver";

export function dashboardRouteMode(pathname: string): DashboardRouteMode {
  return pathname === "/stream" || pathname.startsWith("/stream/") ? "receiver" : "operations";
}
