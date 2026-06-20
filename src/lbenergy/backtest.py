"""
backtest.py — Event-level counterfactual evaluation of the preheat controller.

The dataset is historical and already contains the CURRENT (blind) control, so we
cannot literally re-run the building. Instead we replay each event as a
counterfactual:

  • B1 (current / observed)  — read straight from the data: the electrical energy
    actually drawn in the preheat window, and the room temperature actually
    reached at the deadline.
  • B3 (our model)           — the controller picks a start time; we simulate the
    room forward with the RC model and read the comfort it would have achieved,
    plus the electrical energy our Mode-1-only strategy would have drawn.

Energy accounting (ELECTRICAL only — power_draw.csv measures electrical power):
  Verified from data: standby and Mode-1 (fan + hot-water coil) draw the SAME
  ~4.7 kW electrically; only the Mode-2 electric boost spikes to ~70 kW. Our
  controller starts the cheap coil early enough to reach comfort WITHOUT the
  boost, so B3's electrical draw ≈ flat 4.7 kW. The saving vs B1 is essentially
  the boost energy B1 burned. (The coil's thermal/gas cost is similar for both
  strategies and is not in this dataset, so we report the electrical delta only.)

All € / CO₂ factors are assumptions (see config) — label them in any slide.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import (
    T_SETPOINT, SAFETY_MARGIN, P_STANDBY_KW, BOOST_KW_THRESHOLD,
    TARIFF_EUR_PER_KWH, CO2_KG_PER_KWH, BACKTEST_LOOKBACK_H,
    COOL_STANDBY_KW, BACKTEST_PRECOOL_LOOKBACK_H,
)
from .data import load_power_raw
from .pipeline import WINDOWS
from .preheat import predict_preheat_start, predict_precool_start


def dedupe_events(events: pd.DataFrame) -> pd.DataFrame:
    """Drop exact-duplicate (starts_at, ends_at) rows (the heating window has them)."""
    return (events.drop_duplicates(subset=["starts_at", "ends_at"])
                  .sort_values("starts_at").reset_index(drop=True))


def _window_energy_kwh(power_total: pd.Series, t0, t1) -> float:
    """Integrate actual total electrical power (kW, 5-min) over [t0, t1] → kWh."""
    seg = power_total.loc[t0:t1]
    if len(seg) < 2:
        return float("nan")
    return float(seg.sum() * (5.0 / 60.0))     # 5-min samples → kWh


def evaluate_event(
    df: pd.DataFrame,
    power_total: pd.Series,
    beta: tuple[float, float, float],
    t_event,
    lookback_h: float,
    T_supply_nom: float,
    mode: str = "heat",
    standby_kw: float = P_STANDBY_KW,
    setpoint: float = T_SETPOINT,
) -> dict | None:
    """
    Evaluate one event: B1 (observed) vs B3 (our controller).

    `mode` selects direction. Heating recovers from the overnight TROUGH up to
    setpoint−margin; cooling pulls the pre-event PEAK down to setpoint+margin.
    The worst-case pre-event extreme is the conservative, honest choice for
    "how hard is this pre-conditioning?".
    """
    t0 = t_event - pd.Timedelta(hours=lookback_h)
    win = df.loc[t0:t_event]
    if len(win) < 4:
        return None

    T_out_win = float(win["T_out"].mean())         # representative outside temp

    if mode == "heat":
        T_start   = float(win["T_room"].min())     # overnight setback trough
        T_target  = setpoint - SAFETY_MARGIN
        lead_h, traj = predict_preheat_start(
            T_room_now=T_start, T_out_const=T_out_win,
            hours_to_event=lookback_h, beta=beta, T_supply_nom=T_supply_nom,
            T_target=T_target,
        )
        on_time = lambda T: T >= T_target          # noqa: E731
    else:                                          # cooling
        T_start   = float(win["T_room"].max())     # warmest pre-event drift
        T_target  = setpoint + SAFETY_MARGIN
        lead_h, traj = predict_precool_start(
            T_room_now=T_start, T_out_const=T_out_win,
            hours_to_event=lookback_h, beta=beta, T_supply_nom=T_supply_nom,
            T_target=T_target,
        )
        on_time = lambda T: T <= T_target          # noqa: E731

    T_pred_deadline = float(traj[-1])
    feasible   = lead_h < lookback_h - 1e-3        # reached target within the window
    on_time_B3 = on_time(T_pred_deadline)
    # Mode-1 only (no boost) ⇒ flat standby-level electrical draw across the window.
    E_B3 = standby_kw * lookback_h

    # ── B1: current system, straight from the data ────────────────────────
    T_obs_deadline = float(df["T_room"].asof(t_event))   # nearest prior reading
    on_time_B1 = on_time(T_obs_deadline)
    E_B1 = _window_energy_kwh(power_total, t0, t_event)

    return {
        "event_start":      t_event,
        "setpoint":         round(setpoint, 1),
        "T_start":          round(T_start, 2),
        "T_out_window":     round(T_out_win, 2),
        "B3_lead_h":        round(lead_h, 2),
        "B3_feasible":      feasible,
        "B3_T_deadline":    round(T_pred_deadline, 2),
        "B3_on_time":       on_time_B3,
        "B1_T_deadline":    round(T_obs_deadline, 2),
        "B1_on_time":       on_time_B1,
        "E_B1_kwh":         round(E_B1, 1),
        "E_B3_kwh":         round(E_B3, 1),
        "kwh_saved":        round(E_B1 - E_B3, 1),
    }


def run_backtest(
    window: str = "heating",
    beta: tuple[float, float, float] | None = None,
    lookback_h: float | None = None,
) -> tuple[pd.DataFrame, dict]:
    """
    Backtest the controller over all (deduped) events in a window.

    Dispatches on `window`: "heating" calibrates a heat-up model and runs the
    preheat controller; "cooling" calibrates a cool-down model and runs the
    precool controller. Returns (per_event_df, summary_dict).
    """
    from .pipeline import run_pipeline
    from .rc_model import fit_heatup_trajectory, fit_cooldown_trajectory

    df, events = run_pipeline(window)
    events = dedupe_events(events)

    # Calibrate the trajectory model on this window (consistent supply temp).
    # Trajectory fitting is what makes lead times realistic — see fit docstrings.
    if window == "cooling":
        mode = "cool"
        fit = fit_cooldown_trajectory(df)
        standby_kw = COOL_STANDBY_KW
        lookback_h = BACKTEST_PRECOOL_LOOKBACK_H if lookback_h is None else lookback_h
    else:
        mode = "heat"
        fit = fit_heatup_trajectory(df)
        standby_kw = P_STANDBY_KW
        lookback_h = BACKTEST_LOOKBACK_H if lookback_h is None else lookback_h

    if beta is None:
        beta = (fit["beta1"], fit["beta2"], fit["beta3"])
    T_supply_nom = fit["T_supply_eff"]

    power_total = load_power_raw(WINDOWS[window]).groupby("ts")["kw"].sum()

    # Per-event occupied setpoint.
    #  • Cooling: genuinely varies per slot (15–21 °C) — read the observed value
    #    15 min INTO the event (the boundary reading can still be the setback).
    #  • Heating: the occupied target for every morning lecture is 21 °C; the
    #    control log occasionally still reads the 11 °C setback at the boundary
    #    (a data artifact, not a real comfort goal), so we use the fixed setpoint.
    def event_setpoint(t_event) -> float:
        if mode == "cool" and "setpoint" in df:
            sp = df["setpoint"].asof(t_event + pd.Timedelta(minutes=15))
            if pd.notna(sp):
                return float(sp)
        return T_SETPOINT

    rows = [r for e in events["starts_at"]
            if (r := evaluate_event(df, power_total, beta, e, lookback_h,
                                    T_supply_nom=T_supply_nom, mode=mode,
                                    standby_kw=standby_kw,
                                    setpoint=event_setpoint(e))) is not None]
    per_event = pd.DataFrame(rows)

    kwh_saved = per_event["kwh_saved"].sum()
    summary = {
        "window":             window,
        "mode":               mode,
        "n_events":           len(per_event),
        "model_T_supply_eff": round(T_supply_nom, 1),
        "model_ramp_rmse":    round(fit["ramp_rmse_degC"], 3),
        "mean_lead_h_B3":     round(per_event["B3_lead_h"].mean(), 2),
        "on_time_rate_B1":    round(per_event["B1_on_time"].mean(), 3),
        "on_time_rate_B3":    round(per_event["B3_on_time"].mean(), 3),
        "mean_comfort_B1":    round(per_event["B1_T_deadline"].mean(), 2),
        "mean_comfort_B3":    round(per_event["B3_T_deadline"].mean(), 2),
        "total_kwh_B1":       round(per_event["E_B1_kwh"].sum(), 1),
        "total_kwh_B3":       round(per_event["E_B3_kwh"].sum(), 1),
        "kwh_saved":          round(kwh_saved, 1),
        "pct_saved":          round(100 * kwh_saved / per_event["E_B1_kwh"].sum(), 1),
        "eur_saved":          round(kwh_saved * TARIFF_EUR_PER_KWH, 1),
        "co2_saved_kg":       round(kwh_saved * CO2_KG_PER_KWH, 1),
    }
    return per_event, summary
