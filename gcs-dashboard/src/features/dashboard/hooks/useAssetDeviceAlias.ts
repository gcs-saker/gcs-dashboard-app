import { useMutation, useQueryClient } from "@tanstack/react-query";
import { renameRegisteredDevice } from "@dashboard/adminDeviceApi";

export function useAssetDeviceAlias(sessionScope: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ deviceUuid, displayName }: { deviceUuid: string; displayName: string }) =>
      renameRegisteredDevice(deviceUuid, displayName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "accessible-group-inventory", sessionScope],
      });
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "admin-devices"] });
    },
  });

  return {
    errorMessage: mutation.error instanceof Error ? mutation.error.message : null,
    isSaving: mutation.isPending,
    savingDeviceUuid: mutation.variables?.deviceUuid ?? null,
    rename: async (deviceUuid: string, displayName: string): Promise<void> => {
      await mutation.mutateAsync({ deviceUuid, displayName });
    },
  };
}
