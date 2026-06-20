# 📢 `main` updated — please rebase your branches

`main` has moved on since the package split. Two waves of change:

1. **(earlier)** the old monolithic `src/explore_and_fit.py` was split into the
   `src/lbenergy/` package.
2. **(now)** the data layer became **two pipelines**, a **second data source** and a
   **backtest** were added, and the **model fit changed** to trajectory calibration.

Please read this before you pull.

## Current layout

```
src/lbenergy/        ← the model as an importable package
  config.py            repo-relative paths + constants (grids, thresholds, savings assumptions)
  data.py              shared load + clean() + TWO builders (see below)
  external.py          2nd data source: Open-Meteo weather (fetch + join)   ← NEW
  pipeline.py          run_pipeline() / run_anomaly_pipeline()
  rc_model.py          RC fit + fit_heatup_trajectory() + simulation (physics core)
  preheat.py           predict_preheat_start() — the decision output / integration point
  backtest.py          event-level B1-vs-B3 evaluation + kWh/€/CO₂               ← NEW
  residual.py          LightGBM residual corrector (SCAFFOLD — needs implementing)
  evaluate.py, plots.py
api.py               FastAPI layer for the frontend (no DB)                      ← NEW
                     uvicorn api:app --reload  → http://127.0.0.1:8000/docs
scripts/
  train.py             python scripts/train.py      → models/rc_params.json
  backtest.py          python scripts/backtest.py    → outputs/backtest_*.csv     ← NEW
  run_diagnostics.py   python scripts/run_diagnostics.py → outputs/ plots
models/  notebooks/  outputs/
```

## ⚠️ Breaking / behavioural changes to know

1. **Two pipelines now — pick the right one:**
   - `run_pipeline("heating")` → **prediction** frame: room-level, **15-min**, median-aggregated.
   - `run_anomaly_pipeline("heating")` → **anomaly** frame: device-level, **native ~90 s**.
   - The old `build_dataset` still works (alias → `build_prediction_frame`) but is now 15-min/median,
     **not** the old 5-min/mean. If you depended on 5-min room frames, that changed.

2. **`data.py` was rewritten** around a shared `clean()` + `load_snapshots_raw`. New public funcs:
   `build_prediction_frame`, `build_anomaly_frame`, `clean`, `load_snapshots_raw`, `load_power_raw`.
   `load_snapshots` / `load_power` are kept as deprecated aliases.

3. **The deployed model fit changed.** Use `fit_heatup_trajectory(df)` (trajectory calibration) for
   control params — **not** `fit_rc_ols` (now a diagnostic for the passive-cooling τ). The controller
   must simulate with the returned **`T_supply_eff` (~37.5 °C)**, not 59 °C — this was the bug behind
   unrealistic lead times.

4. **`models/rc_params.json` schema changed:** now `{beta1, beta2, beta3, T_supply_eff, ramp_rmse_degC,
   n_ramps, tau_cool_hours}` — no longer `{beta, tau}`. Re-run `python scripts/train.py` after pulling.

5. **New dependency surface:** `external.py` calls Open-Meteo over HTTP (offline-safe fallback to NaN);
   weather caches to `data/_external_cache/` as CSV (parquet isn't installed here). **`api.py` adds
   `fastapi` + `uvicorn`** (now in `requirements.txt`) — `pip install -r requirements.txt` after pulling.

## To run anything

```bash
pip install -r requirements.txt
python scripts/train.py                 # calibrate → models/rc_params.json
python scripts/backtest.py --window heating   # B1 vs B3 savings → outputs/
python scripts/run_diagnostics.py       # full analysis → outputs/ plots
```

Works on a fresh clone — no path editing.

## Docs

- `docs/PDR.md` and `README.md` were **reconciled** to the built system (β-model, two-stage
  heating, two pipelines, real backtest numbers). If you quoted old figures, refresh them.
- New: [`docs/beststart_prediction/PIPELINE.md`](docs/beststart_prediction/PIPELINE.md) (how to use
  the pipeline — start here) and [`DATA_CONTRACT.md`](docs/beststart_prediction/DATA_CONTRACT.md)
  (schema + cleaning contract).
- [`BUILD_LOG.md`](BUILD_LOG.md) at the root tracks what's built + next steps.
- Existing: `MODEL_DESIGN.md`, `IHL_optimal_start_guide.md`, `comparisson.md`, `plan_yassir.md`.

## Frontend / backend

Still **not** in this repo — whoever owns those keeps them separate. **The frontend now talks to
the model over HTTP via `api.py`** (FastAPI, no DB): `uvicorn api:app --reload`, then
`GET /backtest`, `/preheat`, `/trajectory`, `/model` (interactive docs at `/docs`, CORS open).
The underlying integration points remain `predict_preheat_start()` (`preheat.py`) and
`run_backtest()` (`backtest.py`).

## ⚠️ Action needed — rebase now while conflicts are small

```bash
git fetch origin
git rebase origin/main      # or: git merge origin/main
```

If you had work in `data.py` or the old `build_dataset`, port it into the new
`build_prediction_frame` / `build_anomaly_frame` (the aggregation rules moved there).

## Housekeeping notes

1. Re-run `scripts/train.py` after rebasing — the saved params format changed (see #4 above).
2. `.idea/`, `.DS_Store`, and `data/_external_cache/` should be gitignored — don't commit them.
