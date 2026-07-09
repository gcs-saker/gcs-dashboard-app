import { lazy } from "react";

export const loadTacticalLeafletMap = () => import("./map/TacticalLeafletMap");
export const loadEventLogView = () => import("./components/EventLogView");
export const loadTimeSyncSettingsView = () => import("./components/TimeSyncSettingsView");

export const TacticalLeafletMap = lazy(() =>
  loadTacticalLeafletMap().then((module) => ({ default: module.TacticalLeafletMap })),
);

export const EventLogView = lazy(() =>
  loadEventLogView().then((module) => ({ default: module.EventLogView })),
);

export const TimeSyncSettingsView = lazy(() =>
  loadTimeSyncSettingsView().then((module) => ({ default: module.TimeSyncSettingsView })),
);

export function preloadDashboardLazyViews(): void {
  void loadEventLogView();
  void loadTimeSyncSettingsView();
  void loadTacticalLeafletMap();
}
