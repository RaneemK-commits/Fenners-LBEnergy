# Build Log — Adaptive Predictive Preheat Control

> Living record of what's built, what we learned, and what's next.
> **Last updated:** 2026-06-20 · **Status:** core pipeline + model + heating & cooling backtests working end-to-end.

---

## Status snapshot

A working, verified pipeline that: ingests the IHL data into two purpose-built frames →
trajectory-calibrates a grey-box RC model → predicts optimal preheat start times →
backtests them against the current system with kWh/€/CO₂ savings → and serves it all to the
frontend over a FastAPI layer (no DB). Runs green from `python scripts/train.py`,
`python scripts/backtest.py`, and `uvicorn api:app`.

**Headline result (heating window, 7 mornings):** current system **0/7** on-time
(mean 18.5 °C); our controller **7/7** (mean 20.5 °C), starting ~4 h earlier in the cheap
heating mode → **~71% / ~558 kWh / €167 / 223 kg CO₂** saved in the preheat window
(electrical; assumptions labelled).

**Cooling window (15 lecture slots):** symmetric precool controller — current **4/15** on-time;
ours **15/15**, precooling ~2 h ahead on the cheap mode → **~39% / ~231 kWh / €69 / 93 kg CO₂**
saved. Same model, signs flipped.

---

## Built so far

### Decisions & research
- [x] **Challenge + partner research** — LBenergy IHL, two-stage savings opportunity, TUM scenario.
- [x] **Approach decision** — RC preheat-timing controller chosen over RL
      ([`comparisson.md`](docs/beststart_prediction/comparisson.md)). Decisive factor: **we
      can only control setpoint timing, not individual pumps** → RL's device-count action is infeasible.
- [x] **Generation prompts** — `PROMPT_1_generate_PDR.md`, `PROMPT_2_predictive_model_deepdive.md`.

### Data pipeline (`src/lbenergy/data.py`, `external.py`, `pipeline.py`)
- [x] **Shared core** — `load_snapshots_raw` + `clean()` (drops alarm/defrost/disconnected/implausible rows; keeps them for anomaly).
- [x] **Prediction pipeline** — `build_prediction_frame`: room-level, **15-min**, median aggregation, boost flag from max-power. (`run_pipeline`)
- [x] **Anomaly pipeline** — `build_anomaly_frame`: device-level, **native ~90 s**, peer-deviation feature `T_room_dev`. (`run_anomaly_pipeline`)
- [x] **2nd data source** — `external.py`: Open-Meteo weather (T_out/solar/wind), join + offline-safe fallback, CSV cache.

### Model (`src/lbenergy/rc_model.py`, `preheat.py`)
- [x] **RC physics core** — `dT/dt = β₁(T_supply−T_room) + β₂(T_room−T_out) + β₃`; forward-Euler simulation.
- [x] **OLS system ID** — `fit_rc_ols` (+ boost nuisance regressor; passive-cooling τ diagnostic).
- [x] **Trajectory calibration** — `fit_heatup_trajectory`: fits β to real warming curves + reports `T_supply_eff` (≈37.5 °C). **This is the deployed fit.**
- [x] **Controller** — `predict_preheat_start`: binary-search the latest start that hits target by event.

### Validation (`src/lbenergy/backtest.py`, `evaluate.py`)
- [x] **Event-level backtest (heating)** — `backtest.py`: B1 (observed) vs B3 (model), per-event metrics + kWh/€/CO₂, dedupes the doubled heating events.
- [x] **Event-level backtest (cooling)** — symmetric **precool** path: `fit_cooldown_trajectory` + `predict_precool_start`; `run_backtest("cooling")` pulls the warmest pre-event drift down to each slot's (varying 15–21 °C) setpoint+margin. **B3 15/15 on-time vs B1 4/15; ~39% / 231 kWh saved.**
- [x] **Cross-window check** — `evaluate.py`: apply heating β to the cooling window.
- [x] **CLI + artifacts** — `scripts/train.py` → `models/rc_params.json`; `scripts/backtest.py [--window heating|cooling]` → `outputs/backtest_{window}.csv`.

### Serving (`api.py`)
- [x] **FastAPI layer (no DB)** — thin HTTP wrapper over the model; calibrates once at startup.
      Endpoints: `/health`, `/model`, `/backtest`, `/preheat` (+ setpoint what-if), `/trajectory`.
      CORS open; interactive docs at `/docs`. This is the frontend integration seam.

### Docs
- [x] `PDR.md`, `README.md` — **reconciled** to the built system (β-model, two-stage, two pipelines, real numbers).
- [x] `DATA_CONTRACT.md`, `PIPELINE.md`, `MODEL_DESIGN.md`, `comparisson.md`.

---

## Key findings (the things we learned by reading the data)

1. **Two-stage heating (verified).** Mode-1 (fan + hot-water coil, ~4.7 kW electrical, cheap)
   does the work; Mode-2 (electric boost, 53–73 kW, ~15× costlier) is a last-resort the current
   system leans on — and still misses comfort. **Our savings come from starting Mode-1 early to
   avoid Mode-2.**
2. **Supply-temp representation bug.** The 59 °C is one device; the median across 4 is ~37.5 °C.
   The controller was simulating at 59 while the model was fit at ~37 → bogus 2.7 h leads. Fixed
   by using `T_supply_eff` consistently → realistic ~4 h leads.
3. **Calibrate by trajectory, not instantaneous dT/dt.** Instantaneous OLS overstates warming
   (misses thermal-mass lag); trajectory fitting reproduces the real curve (0.17 °C ramp RMSE).
4. **Row count ≠ information.** 15-min aggregation beats 5-min for the fit (less dT/dt noise);
   device-averaging denoises rather than loses data.
5. **The events aren't uniform.** Heating = 7 real all-day mornings (duplicated rows); cooling =
   15 realistic back-to-back lecture slots (the multi-event testbed).

---

## Verified results

| Metric | Value |
|---|---|
| Heat-up ramp trajectory RMSE | **0.17 °C** |
| Cool-down ramp trajectory RMSE | **0.05 °C** |
| Mean preheat lead (B3, heating) | **4.07 h** (range 3.1–5.0) |
| Mean precool lead (B3, cooling) | **1.98 h** |
| On-time comfort (heating) | **B1 0/7 · B3 7/7** |
| On-time comfort (cooling) | **B1 4/15 · B3 15/15** |
| Mean room temp at deadline (heating) | B1 18.5 °C · B3 20.5 °C |
| Preheat-window energy saved (heating) | **~558 kWh · ~71% · €167 · 223 kg CO₂** (7 mornings) |
| Precool-window energy saved (cooling) | **~231 kWh · ~39% · €69 · 93 kg CO₂** (15 slots) |

---

## Known limitations / honest caveats

- **B3 comfort is a model prediction**, B1 is observed — don't conflate their evidentiary weight.
- **Savings are electrical, preheat-window only.** B1's larger *post-deadline* catch-up (70 kW for
  hours, comfort at 13:20) is additional, unquantified.
- **β₂ pins to 0** in the heat-up fit (loss unidentifiable on short ramps) — fine for the preheat
  ramp, don't extrapolate to long horizons.
- **Cooling β is degenerate** — the cool-down fit lands on near-constant drift (β₁≈β₂≈0, β₃≈−0.65 °C/h): the short cooling ramps don't identify the supply/loss split, so the precool model is an honest constant-rate cooler, not a full RC. Fine for the demonstrated leads (~2 h); don't extrapolate. (Heat-up fit is the richer one.)
- **Cooling savings exclude the gentler post-deadline story** — same electrical-only, pre-conditioning-window caveat as heating.
- **Controller uses a constant T_out** over the preheat window, not the hourly forecast yet.
- **Generalisation (tents→containers) is structural**, demonstrated by parameter sweep, not proven
  empirically (single-building data).
- **€/CO₂ factors are assumptions** (config: €0.30/kWh, 0.40 kg/kWh).

---

## Next steps (prioritised for remaining hackathon time)

### P1 — highest demo value
- [ ] **Savings / visualization layer** (Pillar 3) — a frontend (or Streamlit) that consumes the
      `api.py` endpoints: per-event kWh/€/CO₂ bars, the 0/7→7/7 comfort story, the `/preheat` what-if slider.
- [x] **Cooling-window backtest** — done: precool controller wired into `run_backtest("cooling")`;
      the realistic multi-event lecture days validate at 15/15 on-time. ✅

### P2 — strong additions
- [ ] **Anomaly detector** (Pillar 2) — the `build_anomaly_frame` is ready; build a detector on
      `T_room_dev` + pressures + alarm registers, with **defrost handled** so it doesn't false-alarm.
- [ ] **Generalisation sweep demo** — run the same β-ODE with tent/container/hall τ on the real
      weather trace → the "same model, any building" visual.

### P3 — accuracy / polish
- [ ] **Wire the weather forecast into the controller** — use `external.py`'s hourly T_out across the
      preheat window instead of a constant.
- [ ] **ML residual layer** — implement `ResidualCorrector` (LightGBM) on RC residuals; quantile bands.
- [ ] **Parameter refinement** — better cooldown handling / a 2-state model if time allows; pin β with
      leave-one-event-out trajectory CV.
- [ ] **"Fewer units?" what-if** — offline analysis (reduced effective capacity) answering the brief's question.

### P4 — pitch
- [ ] Demo script + slide deck; rehearse on the real screen; record a backup video.

---

## File map (where things live)

```
api.py         FastAPI layer for the frontend (no DB)  →  uvicorn api:app --reload
src/lbenergy/  config · data · external · pipeline · rc_model · preheat · backtest · residual · evaluate · plots
scripts/       train.py · backtest.py · run_diagnostics.py
models/        rc_params.json  (β + T_supply_eff)
outputs/       backtest_heating.csv · backtest_cooling.csv · diagnostic_*.png
docs/          PDR.md · beststart_prediction/{PIPELINE,DATA_CONTRACT,MODEL_DESIGN,comparisson,...}.md
```
