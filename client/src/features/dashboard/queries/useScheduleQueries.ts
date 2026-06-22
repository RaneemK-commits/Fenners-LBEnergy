import { useQuery } from "@tanstack/react-query";
import { scheduleService } from "@/src/services/schedule.services";

export function useSchedule(window: "heating" | "cooling" = "heating") {
  return useQuery({
    queryKey: ["schedule", window],
    queryFn: () => scheduleService.getSchedule(window),
  });
}
