# Frontend Integration — connecting the Next.js client to the model

How the `client/` (Next.js 16) app hooks up to our Python model. There is **no
database** — the model computes from the historical CSVs in memory.

---

## The three moving parts

| Piece | Stack | Role | Status |
|---|---|---|---|
| `client/` | Next.js 16 · React Query · axios · recharts | the UI | built, **uses hardcoded/mock data so far** |
| `backend/` | Node · Express · Mongoose | **auth** (cookie-based), intended gateway | only `/api/auth` implemented |
| `api.py` | FastAPI | **the model** (savings, preheat, alerts) | done — now also serves the client's data contract |

The client uses a single axios base URL (`NEXT_PUBLIC_API_URL`) with
`withCredentials: true` (cookies for auth).

---

## Recommended wiring (fastest path for the hackathon)

**Point the client's data calls at the Python API; keep Node for auth only.**

```
Next client ──(NEXT_PUBLIC_API_URL)──>  FastAPI api.py   (energy, alerts, buildings, model)
            ──(cookie /auth, optional)─>  Node backend    (login/session)
```

`api.py` now serves the **exact endpoints the client services already call**, fed
by real model data — so you can replace the mock data immediately.

> Cleaner long-term alternative: make the Node backend the single gateway and have
> it proxy model requests to `api.py`. More JS work; not needed for the demo.

---

## Setup (3 steps)

1. **Run the model API** (port 8000):
   ```bash
   python -m uvicorn api:app --port 8000        # note: python -m (bare `uvicorn` isn't on PATH here)
   ```
   CORS is already configured for `http://localhost:3000` (override with the
   `FRONTEND_ORIGIN` env var; credentials are allowed).

2. **Point the client at it** — create `client/.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Run the client** (port 3000):
   ```bash
   cd client && npm install && npm run dev
   ```

---

## Endpoint ↔ frontend mapping

Each client service already calls these paths; `api.py` now answers them with real data:

| Client service call | `api.py` endpoint | Data | Real? |
|---|---|---|---|
| `energyService.getStatistics()` | `GET /energy/statistics` | KPI numbers (kWh/€/CO₂/% saved) | ✅ real (heating backtest) |
| `energyService.getConsumption()` | `GET /energy/consumption` | `EnergyConsumptionResponse` (our series) | ✅ real |
| `alertService.getAlerts()` / `getUnreadAlerts()` | `GET /alerts` | `AlertResponse[]` — comfort-risk alerts from real B1 misses | ✅ real |
| `alertService.markAsRead(id)` | `PATCH /alerts/{id}/read` | ack | ✅ stub-ok |
| `buildingService.getBuildings()` / `getBuildingById()` | `GET /buildings` · `/buildings/{id}` | the IHL room w/ real savings | 🟡 1 real building |
| (B1-vs-B3 comparison chart) | `GET /backtest?window=heating\|cooling` | both series + per-event | ✅ real |
| (controller / what-if slider) | `GET /preheat?...&setpoint=` | lead time + trajectory | ✅ real |
| (comfort curve) | `GET /trajectory?window=&index=` | observed vs simulated | ✅ real |
| `scheduleService` | — | not yet | ❌ needs `space_events` mapping |

---

## Wiring the components

These dashboard components are now wired to live data via the React Query hooks
(they were hardcoded arrays before):

| Component | Hook | Endpoint | Status |
|---|---|---|---|
| `kpi-row.tsx` | `useEnergyStatistics()` | `/energy/statistics` | ✅ wired |
| `energy-chart.tsx` | `useEnergyComparison()` | `/backtest` (B1 vs B3) | ✅ wired |
| `alerts.tsx` | `useAlerts()` | `/alerts` | ✅ wired |
| `top-buildings.tsx` | `useBuildings()` | `/buildings` | ✅ wired |
| `heat-pump-status.tsx` | — | (could use `/buildings` units) | ⬜ still hardcoded |
| `scenario-simulator.tsx` | (use `/preheat`) | `/preheat?...&setpoint=` | ⬜ still hardcoded |
| `upcoming-schedule.tsx` | — | needs schedule endpoint | ⬜ still hardcoded |

New service/hook added for the chart: `energyService.getComparison(window)` +
`useEnergyComparison(window)` → `GET /backtest` (carries both `E_B1_kwh` and
`E_B3_kwh` per event; the typed `/energy/consumption` only has one series).

All wired components guard for the loading/empty state, so they render before the
API responds. Pattern, for reference:

```tsx
const { data, isLoading } = useEnergyStatistics();
// data?.energySavedKwh, data?.costSavedEur, data?.co2SavedKg, data?.pctSaved, data?.heatPumps
```

---

## Auth

Cookie auth lives in the Node backend (`/api/auth`). For the demo the Python API
does **not** enforce auth on data endpoints. Options:
- **Demo:** ignore auth, point everything at `api.py` (login screen can stay mock).
- **Full flow:** run Node for `/auth`, keep `withCredentials` for those calls; data
  calls still go to `api.py`. (Two origins — both must be in the client's allow-list
  and each server's CORS. `api.py` already allows credentials from the client origin.)

---

## Honest caveats (what's real vs illustrative)

- **One building.** Our dataset is a single IHL room (4 pumps). Multi-building
  widgets (5 buildings in the mock) are illustrative; `/buildings` returns the one
  real building with real savings.
- **Alerts = comfort-risk**, derived from real B1 misses — a stand-in until the
  dedicated anomaly detector (P2) lands on `build_anomaly_frame`.
- **Schedule** isn't wired yet — needs a `space_events` → schedule mapping.
- **KPI scale.** Real numbers are per-room (e.g. 558 kWh saved), not the campus-wide
  figures in the mock — expect smaller, honest values.
