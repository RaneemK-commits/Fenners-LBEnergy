import { energyService } from "@/src/services/energy.services";
import { useQuery } from "@tanstack/react-query";

export function useEnergyConsumption() {
  return useQuery({
    queryKey: ["energy", "consumption"],
    queryFn: energyService.getConsumption,
  });
}

export function useRealtimeUsage() {
  return useQuery({
    queryKey: ["energy", "realtime"],
    queryFn: energyService.getRealtimeUsage,
    refetchInterval: 10000, // 10 seconds
  });
}

export function useEnergyStatistics() {
  return useQuery({
    queryKey: ["energy", "statistics"],
    queryFn: energyService.getStatistics,
  });
}

export function useEnergyComparison(window: "heating" | "cooling" = "heating") {
  return useQuery({
    queryKey: ["energy", "comparison", window],
    queryFn: () => energyService.getComparison(window),
  });
}