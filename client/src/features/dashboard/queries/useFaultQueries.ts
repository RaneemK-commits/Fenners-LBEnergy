import { faultService } from "@/src/services/fault.services";
import { useQuery } from "@tanstack/react-query";

export function useFaults(window: "heating" | "cooling" = "heating") {
  return useQuery({
    queryKey: ["faults", window],
    queryFn: () => faultService.getFaults(window),
  });
}

export function useFaultTimeline(
  deviceId: string | undefined,
  window: "heating" | "cooling" = "heating",
  // Full window so the temperature profile has every day (incl. before Apr 4),
  // not just the last ~1.25 days. limit is in the key so it busts stale caches.
  limit = 10000
) {
  return useQuery({
    queryKey: ["faults", "timeline", window, deviceId, limit],
    queryFn: () => faultService.getTimeline(deviceId!, window, limit),
    enabled: Boolean(deviceId),
  });
}
