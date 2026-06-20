
import { EnergyConsumptionResponse } from "../@types/energy.type";
import { api } from "../_lib/api/client";

export const energyService = {
  getConsumption: () =>
    api
      .get<EnergyConsumptionResponse>("/energy/consumption")
      .then((res) => res.data),

  getRealtimeUsage: () =>
    api
      .get("/energy/realtime")
      .then((res) => res.data),

  getStatistics: () =>
    api
      .get("/energy/statistics")
      .then((res) => res.data),

  // B1 (current) vs B3 (ours) per event — for the comparison chart.
  getComparison: (window: "heating" | "cooling" = "heating") =>
    api
      .get("/backtest", { params: { window } })
      .then((res) => res.data),
};