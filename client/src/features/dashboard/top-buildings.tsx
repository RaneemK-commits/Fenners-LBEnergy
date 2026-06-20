"use client";

import { Card, CardHeader } from "../../components/ui/card";
import { useBuildings } from "./queries/useBuildingQueries";

interface BuildingRow {
  id: string;
  name: string;
  savingsKwh: number;
}

export function TopBuildings() {
  // Live buildings from the model API (GET /buildings).
  const { data, isLoading } = useBuildings();
  const buildings: BuildingRow[] = (data ?? [])
    .map((b: { id: string; name: string; savingsKwh: number }) => ({
      id: b.id,
      name: b.name,
      savingsKwh: b.savingsKwh,
    }))
    .sort((a: BuildingRow, b: BuildingRow) => b.savingsKwh - a.savingsKwh);

  const max = buildings.length ? buildings[0].savingsKwh : 1;

  return (
    <Card>
      <CardHeader
        title="Top Buildings by Savings"
        action={<button className="text-xs font-medium text-ember-600">View all</button>}
      />
      <div className="flex flex-col gap-3.5">
        {isLoading && <p className="py-4 text-xs text-graphite-600/60">Loading…</p>}
        {!isLoading && buildings.length === 0 && (
          <p className="py-4 text-xs text-graphite-600/60">No buildings.</p>
        )}
        {buildings.map((b) => (
          <div key={b.id}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="text-graphite-900">{b.name}</span>
              <span className="tabular text-graphite-600/70">{b.savingsKwh.toLocaleString()} kWh</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-graphite-700/5">
              <div
                className="h-full rounded-full bg-ember-500"
                style={{ width: `${(b.savingsKwh / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
