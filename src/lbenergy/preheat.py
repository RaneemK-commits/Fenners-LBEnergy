"""
preheat.py — The decision output: optimal pre-conditioning start-time prediction.

Binary-searches the minimum lead time such that the RC simulation reaches the
target temperature exactly at event start. Works in both directions:
  • heating  — warm UP to T_target  (predict_preheat_start)
  • cooling  — cool DOWN to T_target (predict_precool_start)
"""

from __future__ import annotations

import numpy as np

from .config import DT_HOURS, T_SETPOINT, T_SUPPLY_PREHEAT, SAFETY_MARGIN
from .rc_model import simulate_trajectory


def _predict_start(
    T_room_now:     float,
    T_out_const:    float,
    hours_to_event: float,
    beta:           tuple[float, float, float],
    T_supply_nom:   float,
    T_target:       float,
    direction:      str,                 # "heat" (reach ≥ target) or "cool" (reach ≤ target)
    dt_h:           float = DT_HOURS,
    max_lead_h:     float = 24.0,
) -> tuple[float, np.ndarray]:
    """
    Binary-search the minimum pre-conditioning lead time so the RC simulation
    reaches `T_target` by event start. `direction` flips the comparison:
    heating wants the room AT LEAST as warm as target, cooling AT MOST as cool.
    More lead is monotonically more conditioning in both cases.
    """
    def reached(lead_h: float) -> bool:
        n = max(2, int(lead_h / dt_h) + 1)
        T_sup = np.full(n, T_supply_nom)
        T_out = np.full(n, T_out_const)
        T_at_event = simulate_trajectory(T_room_now, T_sup, T_out, beta, dt_h)[-1]
        return T_at_event >= T_target if direction == "heat" else T_at_event <= T_target

    lo, hi = 0.0, max_lead_h
    for _ in range(24):              # 2^24 steps → sub-second precision
        mid = (lo + hi) / 2.0
        if reached(mid):
            hi = mid
        else:
            lo = mid

    optimal = hi
    n_steps = max(2, int(optimal / dt_h) + 1)
    T_sup   = np.full(n_steps, T_supply_nom)
    T_out_a = np.full(n_steps, T_out_const)
    traj    = simulate_trajectory(T_room_now, T_sup, T_out_a, beta, dt_h)
    return optimal, traj


def predict_preheat_start(
    T_room_now:     float,
    T_out_const:    float,
    hours_to_event: float,
    beta:           tuple[float, float, float],
    T_supply_nom:   float = T_SUPPLY_PREHEAT,
    T_target:       float = T_SETPOINT - SAFETY_MARGIN,
    dt_h:           float = DT_HOURS,
    max_lead_h:     float = 24.0,
) -> tuple[float, np.ndarray]:
    """
    Latest preheat start (hours before the event) that warms the room UP to
    `T_target` by event start. Returns (lead_time_hours, trajectory).
    """
    return _predict_start(
        T_room_now, T_out_const, hours_to_event, beta, T_supply_nom,
        T_target, direction="heat", dt_h=dt_h, max_lead_h=max_lead_h,
    )


def predict_precool_start(
    T_room_now:     float,
    T_out_const:    float,
    hours_to_event: float,
    beta:           tuple[float, float, float],
    T_supply_nom:   float,
    T_target:       float = T_SETPOINT + SAFETY_MARGIN,
    dt_h:           float = DT_HOURS,
    max_lead_h:     float = 24.0,
) -> tuple[float, np.ndarray]:
    """
    Cooling mirror of `predict_preheat_start`: latest precool start that cools
    the room DOWN to `T_target` (setpoint + margin) by event start. `T_supply_nom`
    is the cold-supply temperature from `fit_cooldown_trajectory`. Returns
    (lead_time_hours, trajectory).
    """
    return _predict_start(
        T_room_now, T_out_const, hours_to_event, beta, T_supply_nom,
        T_target, direction="cool", dt_h=dt_h, max_lead_h=max_lead_h,
    )
