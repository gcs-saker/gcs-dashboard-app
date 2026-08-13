import { useQuery } from "@tanstack/react-query";
import { fetchAccessibleGroupInventory } from "@dashboard/groupAssetApi";

export function useAccessibleGroupInventory(sessionScope: string) {
  const query = useQuery({
    enabled: Boolean(sessionScope),
    queryKey: ["dashboard", "accessible-group-inventory", sessionScope],
    queryFn: () => fetchAccessibleGroupInventory(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  return query.data;
}
