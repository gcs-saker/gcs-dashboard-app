import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { renameRegisteredDevice } from "@dashboard/devices/adminDeviceApi";

export function useAssetDeviceAlias(sessionScope: string) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingDeviceUuid, setSavingDeviceUuid] = useState<string | null>(null);

  const rename = useCallback(async (deviceUuid: string, displayName: string): Promise<void> => {
    setErrorMessage(null);
    setSavingDeviceUuid(deviceUuid);
    try {
      await renameRegisteredDevice(deviceUuid, displayName);
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "accessible-group-inventory", sessionScope],
      });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "admin-devices"] });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "장비 별칭 저장에 실패했습니다.");
    } finally {
      setSavingDeviceUuid(null);
    }
  }, [queryClient, sessionScope]);

  return {
    errorMessage,
    savingDeviceUuid,
    rename,
  };
}
