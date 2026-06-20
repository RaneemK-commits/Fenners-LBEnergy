"""
rc_model.py — Grey-box RC thermal model: system identification + simulation.

The physics core. Fits the linearised 1R1C ODE to telemetry and forward-
simulates room-temperature trajectories.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.linalg import lstsq

from .config import DT_HOURS, PRED_DT_HOURS, BOOST_KW_THRESHOLD


def fit_rc_ols(df: pd.DataFrame) -> dict:
    """
    Fit the linearised RC ODE via two-stage OLS:

    STAGE 1 — tau from passive-cooling periods only:
      During standby (T_supply ≈ T_out), the supply-air term and the heat-loss
      term are collinear, so we use standby data to fit τ = RC directly:
          dT/dt ≈ −(T_room − T_out) / τ + β₃

    STAGE 2 — β₁ from active-heating periods, with τ fixed from Stage 1:
          dT/dt − β₂·(T_room−T_out) = β₁·(T_supply−T_room) + β₃

    BOOST NUISANCE TERM — the Mode-2 electric boost (~70 kW) adds heat that does
    NOT raise T_supply (it stays ~59 °C in both modes), so without accounting for
    it OLS wrongly attributes that warming to β₁/β₃ and the fit collapses
    (observed R² ≈ 0.11). We add a binary `is_boost` regressor (β₄) purely to
    soak up that variance during fitting:
          dT/dt = β₁·(T_supply−T_room) + β₂·(T_room−T_out) + β₃ + β₄·is_boost
    β₄ is a *nuisance* parameter: our optimised controller runs Mode-1 only
    (boost OFF, is_boost=0), so simulation/control use the clean {β₁,β₂,β₃}.
    """
    clean_all = df.dropna(subset=["dT_dt", "delta_Tsup_room", "delta_Troom_out"])
    clean_all = clean_all[clean_all["dT_dt"].abs() <= 5.0]

    # ── Stage 1: tau from standby cooling ─────────────────────────────────────
    standby = clean_all[
        (clean_all["T_supply"] < clean_all["T_out"] + 5.0) &   # supply ≈ outdoor air
        (clean_all["P_total_kw"] < 10.0)                        # no electric boost
    ]
    if len(standby) >= 10:
        Xs = np.column_stack([
            -standby["delta_Troom_out"].values,   # coefficient = 1/τ
            np.ones(len(standby)),
        ])
        ys = standby["dT_dt"].values
        th_s, _, _, _ = lstsq(Xs, ys)
        tau_stage1 = 1.0 / th_s[0] if th_s[0] > 0 else float("nan")
        beta2_stage1 = -th_s[0]         # β₂ = −1/τ
    else:
        tau_stage1 = float("nan")
        beta2_stage1 = float("nan")

    # ── Stage 2 + combined: OLS on active-heating rows ───────────────────────
    heating = clean_all[
        clean_all["T_supply"] > clean_all["T_room"] + 5.0   # supply is warmer
    ]
    if len(heating) < 10:
        heating = clean_all[clean_all["T_supply"] >= 40.0]  # fallback

    if "is_boost" in heating:                       # provided by build_prediction_frame
        is_boost = heating["is_boost"].values.astype(float)
    else:                                            # fallback if fed a bare frame
        is_boost = (heating["P_total_kw"].values >= BOOST_KW_THRESHOLD).astype(float)

    Xh = np.column_stack([
        heating["delta_Tsup_room"].values,
        heating["delta_Troom_out"].values,
        is_boost,                          # β₄ — boost nuisance regressor
        np.ones(len(heating)),
    ])
    yh = heating["dT_dt"].values
    th_h, _, _, _ = lstsq(Xh, yh)
    beta1_heat, beta2_heat, beta4_boost, beta3_heat = th_h

    yh_pred = Xh @ th_h
    ss_res  = np.sum((yh - yh_pred) ** 2)
    ss_tot  = np.sum((yh - yh.mean()) ** 2)
    r2_heat = 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")
    rmse_h  = np.sqrt(np.mean((yh - yh_pred) ** 2))

    # ── Control parameters: use the HEATING-regime joint fit ────────────────
    # SELECTION RULE (validated by trajectory, not by dT/dt R²):
    # The controller simulates active fan-coil heating, so the heating-regime
    # dynamics are the correct ones to deploy. Empirically these track the real
    # Mar-30 preheat ramp to ~0.7 °C trajectory RMSE, whereas forcing the
    # standby-cooling τ (≈8 h) onto the heating regime gives ~1.8 °C RMSE and
    # the WRONG SIGN (predicts the room cooling during a heat-up). The Stage-1
    # standby τ is retained only as a diagnostic (tau_stage1 in the output).
    beta1_final = beta1_heat
    beta2_final = beta2_heat
    beta3_final = beta3_heat
    tau_final   = -1.0 / beta2_heat if beta2_heat < 0 else float("nan")

    # ── Final quality check on the MODE-1 regime the controller operates in ──
    # The controller simulates boost-OFF preheat, so we score {β₁,β₂,β₃} on the
    # non-boost rows only — the honest metric for what we actually deploy.
    mode1 = clean_all[clean_all["P_total_kw"] < BOOST_KW_THRESHOLD]
    X_all = np.column_stack([
        mode1["delta_Tsup_room"].values,
        mode1["delta_Troom_out"].values,
        np.ones(len(mode1)),
    ])
    y_all      = mode1["dT_dt"].values
    theta_best = np.array([beta1_final, beta2_final, beta3_final])
    y_pred_all = X_all @ theta_best
    rmse_all   = float(np.sqrt(np.mean((y_all - y_pred_all) ** 2)))
    ss_res_all = np.sum((y_all - y_pred_all) ** 2)
    ss_tot_all = np.sum((y_all - y_all.mean()) ** 2)
    r2_all     = float(1 - ss_res_all / ss_tot_all) if ss_tot_all > 0 else float("nan")

    return {
        "beta1":           beta1_final,
        "beta2":           beta2_final,
        "beta3":           beta3_final,
        "beta4_boost":     beta4_boost,    # nuisance term (boost OFF in control)
        "tau_hours":       tau_final,
        "tau_stage1_h":    tau_stage1,
        "beta2_stage1":    beta2_stage1,
        "beta1_heating":   beta1_heat,
        "beta2_heating":   beta2_heat,
        "r2_heating_ols":  r2_heat,
        "rmse_heating_ols": rmse_h,
        "rmse_all":        rmse_all,
        "r2_all":          r2_all,
        "n_standby":       len(standby),
        "n_heating":       len(heating),
        "n_samples":       len(clean_all),
        "theta":           theta_best,
    }


def fit_heatup_trajectory(
    df: pd.DataFrame,
    init: tuple[float, float, float] = (0.05, -0.02, 0.0),
) -> dict:
    """
    Calibrate the heat-up parameters by TRAJECTORY fit (not instantaneous dT/dt).

    Why: instantaneous-rate OLS overstates warming (it captures the fast air
    response, missing thermal-mass lag), so simulated preheat is too short.
    Fitting β to reproduce the observed temperature *curves* over Mode-1 heating
    ramps captures the real sustained warming rate. We also report `T_supply_eff`
    — the median (device-aggregated) supply temperature during heating — which
    the controller MUST use as `T_supply_nom` so control and fit are consistent
    (using one device's 59 °C against a model fit on the ~37 °C median was the
    bug that produced unrealistically short lead times).

    Returns calibrated {β₁,β₂,β₃}, `T_supply_eff`, ramp RMSE and ramp count.
    """
    from scipy.optimize import minimize

    is_boost = df["is_boost"] if "is_boost" in df else (df["P_total_kw"] >= 20).astype(int)
    mask = (df["heating_req"] == 1) & (is_boost == 0) & (df["T_supply"] > df["T_room"] + 3)
    grp = (mask != mask.shift()).cumsum()
    ramps = [g for _, g in df[mask].groupby(grp) if len(g) >= 5]
    if not ramps:
        raise ValueError("No Mode-1 heating ramps found for trajectory calibration.")

    T_supply_eff = float(pd.concat(ramps)["T_supply"].median())

    def ramp_rmse(beta: np.ndarray) -> float:
        err, n = 0.0, 0
        for g in ramps:
            sim = simulate_trajectory(
                float(g["T_room"].iloc[0]),
                g["T_supply"].values, g["T_out"].values,
                tuple(beta), dt_h=PRED_DT_HOURS,
            )
            err += float(np.sum((sim - g["T_room"].values) ** 2)); n += len(g)
        return float(np.sqrt(err / n))

    # Physical bounds: β₁≥0 (heating adds heat), β₂≤0 (loss to outside).
    res = minimize(ramp_rmse, np.array(init), method="L-BFGS-B",
                   bounds=[(0.0, 1.0), (-1.0, 0.0), (-2.0, 2.0)])
    b1, b2, b3 = res.x
    return {
        "beta1": float(b1), "beta2": float(b2), "beta3": float(b3),
        "T_supply_eff": T_supply_eff,
        "ramp_rmse_degC": float(res.fun),
        "n_ramps": len(ramps),
    }


def fit_cooldown_trajectory(
    df: pd.DataFrame,
    init: tuple[float, float, float] = (0.05, -0.02, 0.0),
) -> dict:
    """
    Calibrate the cool-DOWN parameters by trajectory fit — the cooling-season
    mirror of `fit_heatup_trajectory`.

    The RC ODE is sign-symmetric: with a COLD supply (`T_supply < T_room`) the
    β₁·(T_supply−T_room) term is negative and the room cools, so β₁ stays ≥0 and
    β₂≤0 exactly as in heating — only the *data* differs (cold supply, hot
    outside). We select active cool-down ramps and fit β to reproduce the observed
    cooling *curves*. `T_supply_eff` is the median cold-supply temperature the
    controller MUST use as `T_supply_nom`, mirroring the heating-side consistency
    requirement.

    Note on `SUPPLY_DELTA`: cooling supply-vs-room deltas are far gentler than
    heating's (an AC supplies modestly cool air, not 37 °C), so a 1 °C threshold —
    combined with an actual downward room trend — is the right cool-down selector.
    Using heating's 3 °C here finds no usable ramps.

    Returns calibrated {β₁,β₂,β₃}, `T_supply_eff`, ramp RMSE and ramp count.
    """
    from scipy.optimize import minimize

    SUPPLY_DELTA = 1.0
    is_boost = df["is_boost"] if "is_boost" in df else (df["P_total_kw"] >= 20).astype(int)
    cooling_now = df["T_supply"] < df["T_room"] - SUPPLY_DELTA        # cold supply present
    if "dT_dt" in df:
        cooling_now = cooling_now & (df["dT_dt"] < 0)                 # room actually falling
    mask = cooling_now & (is_boost == 0)
    grp = (mask != mask.shift()).cumsum()
    ramps = [g for _, g in df[mask].groupby(grp) if len(g) >= 5]
    if not ramps:
        raise ValueError("No Mode-1 cool-down ramps found for trajectory calibration.")

    T_supply_eff = float(pd.concat(ramps)["T_supply"].median())

    def ramp_rmse(beta: np.ndarray) -> float:
        err, n = 0.0, 0
        for g in ramps:
            sim = simulate_trajectory(
                float(g["T_room"].iloc[0]),
                g["T_supply"].values, g["T_out"].values,
                tuple(beta), dt_h=PRED_DT_HOURS,
            )
            err += float(np.sum((sim - g["T_room"].values) ** 2)); n += len(g)
        return float(np.sqrt(err / n))

    # Same physical bounds as heating: β₁≥0 (supply drives toward its temp), β₂≤0.
    res = minimize(ramp_rmse, np.array(init), method="L-BFGS-B",
                   bounds=[(0.0, 1.0), (-1.0, 0.0), (-2.0, 2.0)])
    b1, b2, b3 = res.x
    return {
        "beta1": float(b1), "beta2": float(b2), "beta3": float(b3),
        "T_supply_eff": T_supply_eff,
        "ramp_rmse_degC": float(res.fun),
        "n_ramps": len(ramps),
    }


def simulate_trajectory(
    T0:             float,
    T_supply_arr:   np.ndarray,
    T_out_arr:      np.ndarray,
    beta:           tuple[float, float, float],
    dt_h:           float = DT_HOURS,
) -> np.ndarray:
    """
    Forward Euler integration of the RC ODE.
    Returns T_room at each time step (same length as inputs).
    """
    b1, b2, b3 = beta
    T = np.empty(len(T_supply_arr))
    T[0] = T0
    for i in range(1, len(T_supply_arr)):
        dT = (b1 * (T_supply_arr[i-1] - T[i-1])
              + b2 * (T[i-1] - T_out_arr[i-1])
              + b3) * dt_h
        T[i] = T[i-1] + dT
    return T
