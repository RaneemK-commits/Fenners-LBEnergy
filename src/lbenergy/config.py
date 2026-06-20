"""
config.py — Central paths and model constants.

All paths are derived from the repo root so the code runs on any machine
after `git clone`. Import these instead of hardcoding absolute paths.
"""

from __future__ import annotations

from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────────────────
# This file lives at <repo>/src/lbenergy/config.py → repo root is parents[2].
REPO_ROOT   = Path(__file__).resolve().parents[2]
DATA_ROOT   = REPO_ROOT / "data"
HEATING_DIR = DATA_ROOT / "heating_2026-03-30_to_2026-04-05"
COOLING_DIR = DATA_ROOT / "cooling_2026-05-25_to_2026-05-31"
OUTPUT_DIR  = REPO_ROOT / "outputs"
MODELS_DIR  = REPO_ROOT / "models"


def ensure_dirs() -> None:
    """Create output/model directories if they don't exist yet."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


# ─── Model constants ──────────────────────────────────────────────────────────
RESAMPLE_MIN     = 5            # controller forward-sim Euler step (fine = accurate)
DT_HOURS         = RESAMPLE_MIN / 60.0

# ── Pipeline resolutions (two pipelines, two grids) ──────────────────────────
# Prediction: room-level, coarse grid — coarser dT/dt is less noisy → better fit
# (verified: 15-min beats 5-min on R² and trajectory RMSE).
PRED_RESAMPLE_MIN = 15
PRED_DT_HOURS     = PRED_RESAMPLE_MIN / 60.0
# Anomaly: device-level, NATIVE resolution (~90 s) — no resampling, since the
# sensors report every ~90 s and a finer grid would just interpolate. We only
# bucket lightly to compute cross-device agreement.
ANOMALY_REF_BUCKET = "2min"

T_SUPPLY_PREHEAT = 59.0         # °C: hot-water coil steady-state supply temperature
T_SETPOINT       = 21.0         # °C: occupied setpoint
T_UNOCCUPIED     = 11.0         # °C: night setback
SAFETY_MARGIN    = 0.5          # °C: preheat to T_setpoint - margin
BOOST_KW_THRESHOLD = 20.0       # kW total: above this = Mode-2 electric boost is active
P_STANDBY_KW       = 4.7        # kW total: Mode-1 fan/coil baseline (verified from data)

# ── Savings assumptions (LABEL these in any reported number) ──────────────────
TARIFF_EUR_PER_KWH = 0.30       # €/kWh electricity price        (ASSUMPTION)
CO2_KG_PER_KWH     = 0.40       # kg CO₂ per kWh grid electricity (ASSUMPTION)
BACKTEST_LOOKBACK_H = 7.0       # overnight setback window (events run 04:30–21:30 → 7h gap)

# Cooling-window analogues (verified from cooling power_draw.csv: ~7.9 kW baseline,
# spikes to ~42 kW — same cheap-baseline / expensive-boost structure as heating).
COOL_STANDBY_KW            = 7.9   # kW total: cooling Mode-1 baseline (no boost)
BACKTEST_PRECOOL_LOOKBACK_H = 3.0  # precool window before a lecture slot (overnight → 06:00)

# Building-type priors for the generalisation sweep (β₁, β₂, τ estimate).
BUILDING_TYPES = {
    "Thin tent (4×8m, canvas)":         {"beta1": 0.50,  "beta2": -2.00,  "tau_est": 0.50},
    "Insulated container (6×3m)":       {"beta1": 0.15,  "beta2": -0.20,  "tau_est": 5.00},
    "Prefab hall (medium)":             {"beta1": 0.08,  "beta2": -0.08,  "tau_est": 12.5},
    "THIS BUILDING (fitted from data)": {"beta1": None,  "beta2": None,   "tau_est": None},
    "Well-insulated permanent hall":    {"beta1": 0.05,  "beta2": -0.015, "tau_est": 66.7},
}
