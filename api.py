"""
api.py — Thin HTTP layer over the lbenergy model, for the frontend.

No database: the model computes from the historical CSVs in memory (a full
backtest is ~0.2 s). The expensive step — calibrating the model — is done ONCE at
startup and cached, so requests are fast.

Run:
    uvicorn api:app --reload
Then open http://127.0.0.1:8000/docs for the interactive API explorer.

Model endpoints (our native shapes):
    GET /health                          — liveness check
    GET /model                           — calibrated parameters (for display)
    GET /backtest?window=heating|cooling — savings data (summary + per-event B1 vs B3)
    GET /preheat?t_room=&t_out=&hours=&setpoint=   — live controller + what-if setpoint
    GET /trajectory?window=&index=       — observed vs simulated curve for one event

Frontend-contract endpoints (match client/src/services/*, fed by real model data):
    GET   /energy/statistics             — KPI numbers
    GET   /energy/consumption            — EnergyConsumptionResponse
    GET   /alerts  ·  GET /alerts/unread — AlertResponse[] (real comfort-risk alerts)
    PATCH /alerts/{id}/read              — mark read
    GET   /buildings  ·  GET /buildings/{id} — the IHL building w/ real savings

See docs/FRONTEND_INTEGRATION.md for how the Next.js client connects.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import os

from lbenergy import (
    run_pipeline, run_backtest, fit_heatup_trajectory, fit_cooldown_trajectory,
    predict_preheat_start, predict_precool_start, simulate_trajectory,
    run_fault_detection,
)
from lbenergy.backtest import dedupe_events
from lbenergy.config import (
    T_SETPOINT, SAFETY_MARGIN, BACKTEST_LOOKBACK_H, BACKTEST_PRECOOL_LOOKBACK_H,
    PRED_DT_HOURS, DT_HOURS, BOOST_KW_THRESHOLD,
)

app = FastAPI(title="LBenergy Preheat API", version="1.0")

# CORS: the Next.js client uses axios `withCredentials: true` (cookies), so the
# allowed origin CANNOT be "*" — it must be the explicit frontend origin(s).
# Override with FRONTEND_ORIGIN (comma-separated) to match the client dev URL.
_origins = os.environ.get(
    "FRONTEND_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# ─── Model cache (calibrate once per window, reuse) ───────────────────────────
_MODELS: dict[str, dict] = {}


def get_model(window: str = "heating") -> dict:
    """Trajectory-calibrate the model for a window, once. Cooling uses the
    cool-down fit (mirrors run_backtest); heating uses the heat-up fit."""
    if window not in _MODELS:
        df, _ = run_pipeline(window)
        hp = fit_cooldown_trajectory(df) if window == "cooling" else fit_heatup_trajectory(df)
        _MODELS[window] = {
            "beta": (hp["beta1"], hp["beta2"], hp["beta3"]),
            "T_supply_eff": hp["T_supply_eff"],
            "ramp_rmse_degC": hp["ramp_rmse_degC"],
            "n_ramps": hp["n_ramps"],
        }
    return _MODELS[window]


def _safe(x):
    """JSON-safe: NaN/inf → None, numpy scalars → python floats."""
    if isinstance(x, (np.floating, float)):
        return None if (x is None or math.isnan(x) or math.isinf(x)) else float(round(x, 3))
    if isinstance(x, (np.integer,)):
        return int(x)
    return x


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/model")
def model() -> dict:
    """Calibrated parameters — useful to show 'how the model was fit'."""
    m = get_model()
    b1, b2, b3 = m["beta"]
    return {
        "beta1": _safe(b1), "beta2": _safe(b2), "beta3": _safe(b3),
        "tau_hours": _safe(-1.0 / b2) if b2 < 0 else None,
        "T_supply_eff": _safe(m["T_supply_eff"]),
        "ramp_rmse_degC": _safe(m["ramp_rmse_degC"]),
        "n_ramps": m["n_ramps"],
    }


@app.get("/backtest")
def backtest(window: str = Query("heating", pattern="^(heating|cooling)$")) -> dict:
    """Savings dashboard data: summary + per-event B1-vs-B3 results."""
    per_event, summary = run_backtest(window)
    records = per_event.to_dict("records")
    # JSON-safe every value
    records = [{k: _safe(v) for k, v in r.items()} for r in records]
    summary = {k: _safe(v) for k, v in summary.items()}
    return {"summary": summary, "events": records}


@app.get("/faults")
def faults(window: str = Query("heating", pattern="^(heating|cooling)$")) -> dict:
    """Fault/anomaly detector output: summary + grouped alert records."""
    scored, alerts_df, summary = _faults(window)
    alerts = alerts_df.to_dict("records") if not alerts_df.empty else []
    return {
        "summary": {k: _safe(v) for k, v in summary.items()},
        "alerts": alerts,
        "sampleCount": int(len(scored)),
    }


@app.get("/faults/timeline")
def faults_timeline(
    window: str = Query("heating", pattern="^(heating|cooling)$"),
    deviceId: str | None = Query(None, description="Optional heat-pump device id"),
    limit: int = Query(1200, ge=100, le=10000),
) -> dict:
    """Device-level scored timeline for technician evidence charts."""
    scored, _, _ = _faults(window)
    rows = scored.reset_index().sort_values("ts")
    if deviceId:
        rows = rows[rows["device_id"] == deviceId]
    rows = rows.tail(limit)

    columns = [
        "ts", "device_id", "T_room", "setpoint", "T_supply", "T_out",
        "P_device_kw", "rc_residual", "residual_z", "cusum_pos", "cusum_neg",
        "defrost", "compressor", "heating_req", "cooling_req",
        "hardware_alarm", "peer_sensor_outlier", "cusum_negative_alarm",
        "cusum_positive_alarm", "rc_negative_shift", "rc_positive_shift",
        "compressor_no_effect", "setpoint_miss", "any_fault_flag",
    ]
    available = [c for c in columns if c in rows.columns]
    records = []
    for record in rows[available].to_dict("records"):
        out = {}
        for key, value in record.items():
            if key == "ts":
                out[key] = pd.Timestamp(value).isoformat()
            else:
                out[key] = _safe(value)
        records.append(out)

    return {
        "window": window,
        "deviceId": deviceId,
        "count": len(records),
        "rows": records,
    }


@app.get("/preheat")
def preheat(
    t_room: float = Query(..., description="current/trough room temp °C"),
    t_out: float = Query(..., description="outside temp °C over the window"),
    hours: float = Query(BACKTEST_LOOKBACK_H, description="hours available before the event"),
    setpoint: float = Query(T_SETPOINT, description="target setpoint °C (what-if lever)"),
) -> dict:
    """
    Live controller. Returns the optimal preheat lead time + predicted trajectory.
    Vary `setpoint` for the '−2 °C' what-if.
    """
    m = get_model()
    target = setpoint - SAFETY_MARGIN
    lead_h, traj = predict_preheat_start(
        T_room_now=t_room, T_out_const=t_out, hours_to_event=hours,
        beta=m["beta"], T_supply_nom=m["T_supply_eff"], T_target=target,
    )
    predicted_temp = float(traj[-1])
    feasible = predicted_temp >= target
    return {
        "lead_hours": _safe(lead_h),
        "feasible": bool(feasible),
        "predicted_temp_at_event": _safe(predicted_temp),
        "on_time": bool(feasible and predicted_temp >= target),
        "setpoint": _safe(setpoint),
        "trajectory_temp": [_safe(float(t)) for t in traj],
        "step_minutes": int(round(PRED_DT_HOURS * 60)),
    }


@app.get("/trajectory")
def trajectory(
    window: str = Query("heating", pattern="^(heating|cooling)$"),
    index: int = Query(0, ge=0, description="event index within the window"),
) -> dict:
    """
    Observed (current system) vs simulated (our model) room-temp curve for one
    event — the data behind the comfort chart.
    """
    df, events = run_pipeline(window)
    events = dedupe_events(events)
    if index >= len(events):
        raise HTTPException(404, f"event index {index} out of range (0..{len(events)-1})")

    m = get_model(window)
    cooling = window == "cooling"
    lookback = BACKTEST_PRECOOL_LOOKBACK_H if cooling else BACKTEST_LOOKBACK_H
    t_event = events["starts_at"].iloc[index]
    t0 = t_event - pd.Timedelta(hours=lookback)
    win = df.loc[t0:t_event]
    if len(win) < 4:
        raise HTTPException(422, "not enough data in the event window")

    # Per-event occupied setpoint (cooling varies 15–21 °C; read 15 min in).
    setpoint = float(df["setpoint"].asof(t_event + pd.Timedelta(minutes=15)))
    if not setpoint == setpoint:        # NaN guard
        setpoint = T_SETPOINT

    # Observed (B1): the current system's real room-temp curve
    observed = [
        {"t": ts.isoformat(), "temp": _safe(float(v))}
        for ts, v in win["T_room"].items()
    ]

    # Simulated (B3): from the pre-event extreme, our controller's curve
    T_out = float(win["T_out"].mean())
    if cooling:
        lead_h, traj = predict_precool_start(
            T_room_now=float(win["T_room"].max()), T_out_const=T_out,
            hours_to_event=lookback, beta=m["beta"], T_supply_nom=m["T_supply_eff"],
            T_target=setpoint + SAFETY_MARGIN,
        )
    else:
        lead_h, traj = predict_preheat_start(
            T_room_now=float(win["T_room"].min()), T_out_const=T_out,
            hours_to_event=lookback, beta=m["beta"], T_supply_nom=m["T_supply_eff"],
            T_target=setpoint - SAFETY_MARGIN,
        )
    start = t_event - pd.Timedelta(hours=lead_h)
    simulated = [
        {"t": (start + pd.Timedelta(hours=i * PRED_DT_HOURS)).isoformat(),
         "temp": _safe(float(v))}
        for i, v in enumerate(traj)
    ]

    return {
        "window": window,
        "event_index": index,
        "deadline": t_event.isoformat(),
        "setpoint": _safe(setpoint),
        "lead_hours": _safe(lead_h),
        "observed": observed,    # current system (B1)
        "simulated": simulated,  # our controller (B3)
    }


# ─── Frontend-compatibility endpoints ────────────────────────────────────────
# These match the contract the Next.js client already expects (see
# client/src/services/*.services.ts and @types/*), fed by REAL model data so the
# team can point NEXT_PUBLIC_API_URL here and replace the mock data. Single
# building (the IHL room) — multi-building widgets stay illustrative.

def _heating() -> tuple:
    """Cached heating backtest (per_event, summary)."""
    global _HEATING
    if "_HEATING" not in globals() or _HEATING is None:
        _HEATING = run_backtest("heating")
    return _HEATING
_HEATING = None
_FAULTS: dict[str, tuple[pd.DataFrame, pd.DataFrame, dict]] = {}


def _faults(window: str) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    if window not in _FAULTS:
        _FAULTS[window] = run_fault_detection(window)
    return _FAULTS[window]


@app.get("/energy/statistics")
def energy_statistics() -> dict:
    """KPI-row numbers, from the real heating backtest."""
    _, s = _heating()
    return {
        "energySavedKwh": s["kwh_saved"],
        "pctSaved":       s["pct_saved"],
        "costSavedEur":   s["eur_saved"],
        "co2SavedKg":     s["co2_saved_kg"],
        "heatPumps":      4,                       # this dataset = 1 room, 4 pumps
        "onTimeRate":     s["on_time_rate_B3"],
    }


@app.get("/energy/consumption")
def energy_consumption() -> dict:
    """EnergyConsumptionResponse — our controller's per-event energy series.
    (For the B1-vs-B3 comparison chart use /backtest, which carries both.)"""
    pe, s = _heating()
    data = [{"timestamp": str(r["event_start"]), "consumption": r["E_B3_kwh"]}
            for r in pe.to_dict("records")]
    return {
        "buildingId": "ihl-room",
        "buildingName": "IHL Climate-Controlled Room",
        "totalConsumption": round(float(pe["E_B3_kwh"].sum()), 1),
        "unit": "kWh",
        "data": data,
    }


@app.get("/energy/power")
def energy_power(window: str = Query("heating", pattern="^(heating|cooling)$")) -> dict:
    """Measured electrical power over time, summed across all pumps, straight from
    data/<window>_*/power_draw.csv — the continuous consumption curve for the chart."""
    base = Path(__file__).resolve().parent / "data"
    folders = sorted(base.glob(f"{window}_*"))
    if not folders:
        return {"window": window, "unit": "kW", "data": []}
    pw = pd.read_csv(folders[0] / "power_draw.csv", parse_dates=["timestamp"])
    total = pw.groupby("timestamp")["power_draw_kw"].sum().sort_index()
    data = [{"ts": ts.isoformat(), "power_kw": _safe(float(v))} for ts, v in total.items()]
    return {"window": window, "unit": "kW", "points": len(data), "data": data}


# Shared optimized-control constants — used by /optimized (the two charts) AND
# /schedule, so the scheduler matches the temperature & power graphs exactly.
OPT_TAU_COOL_H = 78.0    # gentle free-cooling (flatter daily decline)
OPT_OVERSHOOT = 1.5      # preheat overshoots the setpoint by ~1.5 °C at the peak
OPT_HEATING_KW = 40.0    # power while the room is being heated (temperature rising)
OPT_STANDBY_KW = 4.0     # power the rest of the day


@app.get("/optimized")
def optimized(window: str = Query("heating", pattern="^(heating|cooling)$")) -> dict:
    """What the optimized controller would have produced — measured vs. model.

    The optimized room temperature is SIMULATED with the calibrated grey-box RC
    model (lbenergy.rc_model.simulate_trajectory): condition at the effective
    supply temp while demand is on, drift (setback) otherwise, and hold the
    setpoint like a thermostat. Optimized power keeps the real cheap Mode-1 draw
    but removes the expensive electric-boost spikes. Returns the measured series
    alongside, aligned, so the charts plot both from one source.
    """
    df, events = run_pipeline(window)
    cooling = window == "cooling"

    Tout = df["T_out"].to_numpy(dtype=float)
    setp = df["setpoint"].to_numpy(dtype=float)
    room_actual = df["T_room"].to_numpy(dtype=float)
    P = df["P_total_kw"].to_numpy(dtype=float)

    comfort = float(T_SETPOINT)
    n = len(room_actual)
    # Real grid spacing (the pipeline frame is resampled — don't assume the 5-min
    # prediction DT, or the energy integral is 3× off).
    dt_h = float((df.index[1] - df.index[0]).total_seconds() / 3600.0) if n > 1 else float(DT_HOURS)

    # Daily heating deadline = the real lecture/event start times.
    ev = dedupe_events(events)
    raw = df.index.get_indexer(list(ev["starts_at"]), method="nearest")
    deadlines = sorted({int(x) for x in raw if x >= 0})

    # ── Optimized room temperature ──────────────────────────────────────────
    # ONE heating event per day: start 3–4 h before the deadline (longer when it's
    # colder out), ramp up to the setpoint, then the heating switches OFF for the
    # rest of the day — the room free-cools toward the outdoor temperature: gently
    # while it's mild, faster once the night turns cold, until the next preheat.
    # (The calibrated heating β has no loss term — β₂≈0 — so cooling uses a
    # realistic building time constant; the slope still follows the outdoor temp.)
    TAU_COOL_H = OPT_TAU_COOL_H
    OVERSHOOT = OPT_OVERSHOOT

    def free_cool(T0: float, tout_seg: np.ndarray) -> np.ndarray:
        T = np.empty(len(tout_seg))
        T[0] = T0
        k = dt_h / TAU_COOL_H
        for i in range(1, len(tout_seg)):
            T[i] = T[i - 1] + (tout_seg[i - 1] - T[i - 1]) * k
        return T

    room_opt = room_actual.copy()
    heating = np.zeros(n, dtype=bool)
    cur = float(room_actual[0])
    room_opt[0] = cur
    prev = 0
    for d in deadlines:
        lead_h = float(np.clip(3.0 + (12.0 - Tout[d]) / 8.0, 3.0, 4.0))  # colder → up to 4 h
        lead = max(1, int(round(lead_h / dt_h)))
        ps = max(prev, d - lead)
        if ps > prev:  # free-cool from the previous peak down to the preheat start
            seg = ps - prev + 1
            cool = free_cool(cur, Tout[prev:prev + seg])
            room_opt[prev:prev + seg] = cool
            cur = float(cool[-1])
        Lr = d - ps + 1  # single preheat ramp, overshooting the setpoint at the peak
        peak = (comfort - OVERSHOOT) if cooling else (comfort + OVERSHOOT)
        for k in range(Lr):
            frac = 1.0 - math.exp(-3.0 * k / max(1, Lr - 1))
            room_opt[ps + k] = cur + (peak - cur) * frac
        heating[ps:d] = True
        cur = peak
        prev = d
    if prev < n - 1:  # free-cool to the end of the window
        seg = n - prev
        room_opt[prev:n] = free_cool(cur, Tout[prev:n])

    # ── Optimized power — binary ────────────────────────────────────────────
    # The heat pump pulls a steady ~40 kW the whole time the room is being heated
    # (the temperature is rising during the daily preheat), then drops to a ~4 kW
    # standby for the rest of the day. One block of 40 kW per day, 4 kW otherwise.
    power_opt = np.where(heating, OPT_HEATING_KW, OPT_STANDBY_KW)

    data = [
        {
            "ts": pd.Timestamp(t).isoformat(),
            "room": _safe(float(ra)),
            "setpoint": _safe(float(sp)),
            "outside": _safe(float(to)),
            "optimized": _safe(float(ro)),
            "power": _safe(float(pw)),
            "powerOptimized": _safe(float(po)),
        }
        for t, ra, sp, to, ro, pw, po in zip(
            df.index, room_actual, setp, Tout, room_opt, P, power_opt
        )
    ]
    return {"window": window, "dtHours": _safe(dt_h), "data": data}


@app.get("/schedule")
def schedule(window: str = Query("heating", pattern="^(heating|cooling)$")) -> dict:
    """Real lecture/event schedule (from space_events) with the optimizer's
    recommended preheat start time per event (3–4 h before, colder → earlier)."""
    df, events = run_pipeline(window)
    ev = dedupe_events(events)
    tout = df["T_out"]
    rows = []
    for i, e in enumerate(ev.to_dict("records")):
        start = pd.Timestamp(e["starts_at"])
        end = pd.Timestamp(e["ends_at"]) if e.get("ends_at") is not None else None
        try:
            tout_at = float(tout.asof(start))
        except Exception:
            tout_at = float(tout.mean())
        if not (tout_at == tout_at):  # NaN guard
            tout_at = float(tout.mean())
        lead_h = float(np.clip(3.0 + (12.0 - tout_at) / 8.0, 3.0, 4.0))
        preheat = start - pd.Timedelta(hours=lead_h)
        peak_c = (float(T_SETPOINT) - OPT_OVERSHOOT) if window == "cooling" else (float(T_SETPOINT) + OPT_OVERSHOOT)
        rows.append({
            "id": f"ev-{i}",
            "name": e.get("name") or f"Event {i + 1}",
            "start": start.isoformat(),
            "end": end.isoformat() if end is not None else None,
            "preheatStart": preheat.isoformat(),
            "leadHours": _safe(lead_h),
            "targetC": _safe(float(T_SETPOINT)),
            "peakC": _safe(peak_c),                       # overshoot peak (temp graph)
            "heatingKw": _safe(OPT_HEATING_KW),           # power while heating (power graph)
            "energyKwh": _safe(OPT_HEATING_KW * lead_h),  # preheat-pulse energy
            "outsideC": _safe(tout_at),
        })
    return {"window": window, "count": len(rows), "events": rows}


@app.get("/alerts")
@app.get("/alerts/unread")
def alerts() -> list[dict]:
    """AlertResponse[] — REAL comfort-risk alerts: every event the current system
    failed to reach the target becomes an alert (this is the anomaly story until
    the dedicated detector lands)."""
    pe, _ = _heating()
    out = []
    for i, r in enumerate(pe.to_dict("records")):
        if not r["B1_on_time"]:
            gap = round(r["setpoint"] - r["B1_T_deadline"], 1) if "setpoint" in r else None
            sev = "critical" if (gap or 0) >= 2 else "high" if (gap or 0) >= 1 else "medium"
            out.append({
                "id": f"comfort-{i}",
                "title": "Comfort target missed",
                "message": f"Room reached {r['B1_T_deadline']} °C at event start "
                           f"(target {r.get('setpoint','?')} °C) — start preheat earlier.",
                "severity": sev,
                "isRead": False,
                "createdAt": str(r["event_start"]),
            })
    return out


@app.patch("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: str) -> dict:
    return {"id": alert_id, "isRead": True}


@app.get("/buildings")
def buildings() -> list[dict]:
    """One real building (the IHL room) with real savings from the backtest.
    Shape matches the client's BuildingRecord mock so it can drop in."""
    _, s = _heating()
    return [_ihl_building(s)]


@app.get("/buildings/{building_id}")
def building_by_id(building_id: str) -> dict:
    _, s = _heating()
    return _ihl_building(s)


def _ihl_building(s: dict) -> dict:
    return {
        "id": "ihl-room",
        "name": "IHL Climate-Controlled Room",
        "location": "TUM Ottobrunn-Taufkirchen",
        "savingsKwh": s["kwh_saved"],
        "savingsPercent": s["pct_saved"],
        "totalUnits": 4,
        "activeUnits": 4,
        "units": [
            {"id": f"u{i+1}", "name": f"Heat pump {i+1}", "status": "active",
             "temperature": round(s["mean_comfort_B3"], 1),
             "targetTemperature": T_SETPOINT, "energyToday": round(s["total_kwh_B3"] / 4, 1)}
            for i in range(4)
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
