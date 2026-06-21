import { api } from "../_lib/api/client";

export const scheduleService = {
  getSchedule: (window: "heating" | "cooling" = "heating") =>
    api.get("/schedule", { params: { window } }).then((res) => res.data),
};
