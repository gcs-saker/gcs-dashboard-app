import type { StreamDeviceAliases } from "@dashboard/preferences/streamPreferences";
import type { DashboardUserPreferences } from "@dashboard/preferences/userPreferences";

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
