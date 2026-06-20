"""
lbenergy — Adaptive Predictive Preheat Control (grey-box RC + ML residual).

Public API re-exported here so callers can do, e.g.:

    from lbenergy import run_pipeline, fit_rc_ols, predict_preheat_start
"""

from __future__ import annotations

from . import config
from .data import (
    build_dataset, build_prediction_frame, build_anomaly_frame,
    load_snapshots_raw, load_power_raw, clean,
    load_snapshots, load_power, load_events,
)
from .pipeline import run_pipeline, run_anomaly_pipeline, persist_parquet
from .rc_model import (
    fit_rc_ols, fit_heatup_trajectory, fit_cooldown_trajectory, simulate_trajectory,
)
from .preheat import predict_preheat_start, predict_precool_start
from .evaluate import validate_on_cooling, trajectory_rmse
from .residual import ResidualCorrector
from .external import fetch_weather, join_external
from .backtest import run_backtest, evaluate_event, dedupe_events

__all__ = [
    "config",
    "build_dataset", "build_prediction_frame", "build_anomaly_frame",
    "load_snapshots_raw", "load_power_raw", "clean",
    "load_snapshots", "load_power", "load_events",
    "run_pipeline", "run_anomaly_pipeline", "persist_parquet",
    "fit_rc_ols", "fit_heatup_trajectory", "fit_cooldown_trajectory", "simulate_trajectory",
    "predict_preheat_start", "predict_precool_start",
    "validate_on_cooling", "trajectory_rmse",
    "ResidualCorrector",
    "fetch_weather", "join_external",
    "run_backtest", "evaluate_event", "dedupe_events",
]
