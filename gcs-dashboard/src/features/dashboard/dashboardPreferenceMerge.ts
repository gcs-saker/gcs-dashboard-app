import type { StreamDeviceAliases } from "./streamPreferences";
import type { DashboardUserPreferences } from "./userPreferences";

export function mergeDashboardPreferencesWithStreamAliases(
  preferences: DashboardUserPreferences,
  aliases: StreamDeviceAliases,
): DashboardUserPreferences {
  return {
    ...preferences,
    streamPreferences: {
      deviceAliases: {
        ...preferences.streamPreferences.deviceAliases,
        ...aliases,
      },
    },
  };
}
