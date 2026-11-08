"""Month-by-month scenario simulator, calibrated on the account's own monthly history.

Two modes:
  deterministic : every month uses the official typical values (I, S). With a shock covering the whole
                  horizon this reproduces the sponsor runway exactly (tested).
  monte_carlo   : each path resamples whole historical months (money_in, money_out together, preserving
                  their joint pattern) and scales them so the typical month equals the official I and S.
                  Paths are seeded, so results are reproducible.

Shock parameters are the sponsor ones (r, h, one-off) applied over a window [start, start + duration).
Strategy knobs (free up per month, goal contribution, emergency floor) are explicit dollar rules; no
discretionary spending is inferred from the data.

Probabilities reported here are *model* probabilities of a scenario the user chose; they are not
real-world event probabilities.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np

from .tangerine_metrics import OfficialMetrics


@dataclass
class StrategyAdjust:
    label: str = "Stay the course"
    freed_up_per_month: float = 0.0          # spending reduced by this amount every month (stated by the user / plan)
    goal_contribution_per_month: float = 0.0 # moved from buffer into a goal fund each month
    goal_target: float = 0.0                  # goal fund target in dollars (0 = no goal fund)
    emergency_floor: float = 0.0              # contributions pause while buffer < floor
    goal_contribution_start: int = 0          # month index when contributions start
    extra_income_per_month: float = 0.0       # e.g. side income the user states


@dataclass
class ScenarioSpec:
    scenario_type: str = "baseline"           # baseline | income_loss | higher_costs | one_off | positive_income | combined | custom
    income_fraction: float = 1.0              # r
    bills_increase: float = 0.0               # h
    one_off_cost: float = 0.0                 # C, charged at shock_start
    shock_start: int = 0                      # month index (0 = first projected month)
    shock_duration: int = 6                   # months the income/bills shock lasts
    positive_income_change: float = 0.0       # fraction, e.g. 0.10 = +10% income
    positive_start: int = 0                   # month index when the positive change begins (lasts to horizon)
    horizon_months: int = 24
    n_paths: int = 500
    seed: int = 42
    strategy: StrategyAdjust = field(default_factory=StrategyAdjust)
    label: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


PRESETS: dict[str, dict] = {
    "baseline": dict(scenario_type="baseline", label="Baseline: nothing changes"),
    "income_loss": dict(scenario_type="income_loss", income_fraction=0.55, shock_duration=6, label="Layoff, EI at 55% for 6 months"),
    "higher_costs": dict(scenario_type="higher_costs", bills_increase=0.15, shock_duration=12, label="Household bills up 15% for a year"),
    "one_off": dict(scenario_type="one_off", one_off_cost=-1.0, label="Surprise repair: one month of typical spending"),  # -1 = resolve to S
    "positive_income": dict(scenario_type="positive_income", positive_income_change=0.10, positive_start=0, label="Income up 10%"),
    "combined": dict(scenario_type="combined", income_fraction=0.55, bills_increase=0.15, shock_duration=6, label="Layoff at 55% and bills up 15%"),
}


def resolve_preset(name: str, m: OfficialMetrics, **overrides) -> ScenarioSpec:
    if name not in PRESETS:
        raise KeyError(name)
    kw = dict(PRESETS[name])
    kw.update({k: v for k, v in overrides.items() if v is not None})
    if kw.get("one_off_cost", 0) == -1.0:
        kw["one_off_cost"] = m.typical_spending
    strat = kw.pop("strategy", None)
    spec = ScenarioSpec(**kw)
    if isinstance(strat, StrategyAdjust):
        spec.strategy = strat
    elif isinstance(strat, dict):
        spec.strategy = StrategyAdjust(**strat)
    return spec


def _history_arrays(m: OfficialMetrics) -> tuple[np.ndarray, np.ndarray]:
    inc = np.array([h["money_in"] for h in m.history], dtype=float)
    out = np.array([h["money_out"] for h in m.history], dtype=float)
    return inc, out


def simulate(m: OfficialMetrics, spec: ScenarioSpec, deterministic: bool = False) -> dict:
    """Run the scenario. Returns per-month percentiles, probabilities and goal progress."""
    T = int(spec.horizon_months)
    I, S, H, B = m.typical_inflow, m.typical_spending, m.household_bills, m.buffer
    st = spec.strategy
    n_paths = 1 if deterministic else max(1, int(spec.n_paths))
    rng = np.random.default_rng(int(spec.seed))

    inc_hist, out_hist = _history_arrays(m)
    med_in = float(np.median(inc_hist)) if len(inc_hist) else 0.0
    med_out = float(np.median(out_hist)) if len(out_hist) else 0.0
    if deterministic or len(inc_hist) < 3 or med_in <= 0 or med_out <= 0:
        income = np.full((n_paths, T), I)
        spend = np.full((n_paths, T), S)
        calibration = "deterministic (typical month every month)"
    else:
        idx = rng.integers(0, len(inc_hist), size=(n_paths, T))
        income = I * (inc_hist[idx] / med_in)
        spend = S * (out_hist[idx] / med_out)
        calibration = f"bootstrap of {len(inc_hist)} historical months, scaled so the typical month equals I and S"

    months = np.arange(T)
    in_shock = (months >= spec.shock_start) & (months < spec.shock_start + spec.shock_duration)
    income = np.where(in_shock[None, :], income * spec.income_fraction, income)
    spend = np.where(in_shock[None, :], spend + spec.bills_increase * H, spend)
    if spec.positive_income_change:
        pos = months >= spec.positive_start
        income = np.where(pos[None, :], income * (1.0 + spec.positive_income_change), income)
    income = income + st.extra_income_per_month
    spend = np.maximum(spend - st.freed_up_per_month, 0.0)

    buffer = np.empty((n_paths, T + 1))
    goal = np.zeros((n_paths, T + 1))
    buffer[:, 0] = B
    immediate_shortfall = np.zeros((n_paths, T + 1), dtype=bool)
    immediate_shortfall[:, 0] = B < 0
    contrib_log = np.zeros((n_paths, T))
    for t in range(T):
        opening = buffer[:, t].copy()
        if t == spec.shock_start and spec.one_off_cost:
            opening -= spec.one_off_cost
        immediate_shortfall[:, t + 1] = opening < 0
        b = opening + income[:, t] - spend[:, t]
        c = np.zeros(n_paths)
        if st.goal_contribution_per_month > 0 and t >= st.goal_contribution_start:
            remaining = np.maximum(st.goal_target - goal[:, t], 0.0) if st.goal_target > 0 else np.full(n_paths, np.inf)
            want = np.minimum(st.goal_contribution_per_month, remaining)
            can = (b - want) >= st.emergency_floor
            c = np.where(can, want, 0.0)
        buffer[:, t + 1] = b - c
        goal[:, t + 1] = goal[:, t] + c
        contrib_log[:, t] = c

    pct = {f"p{p}": np.percentile(buffer, p, axis=0).tolist() for p in (10, 25, 50, 75, 90)}
    min_buffer = buffer.min(axis=1)
    shortfall = (buffer < 0) | immediate_shortfall
    below_any = shortfall.any(axis=1)
    below_by_month = np.maximum.accumulate(shortfall, axis=1).mean(axis=0).tolist()
    first_neg = np.where(below_any, shortfall.argmax(axis=1), -1)
    goal_reached_month = None
    goal_reached_share = None
    if st.goal_target > 0 and st.goal_contribution_per_month > 0:
        reached = goal[:, 1:] >= st.goal_target - 1e-9
        reached_any = reached.any(axis=1)
        goal_reached_share = float(reached_any.mean())
        if reached_any.any():
            goal_reached_month = float(np.median(reached[reached_any].argmax(axis=1) + 1))

    det_month_out = int(first_neg[0]) if deterministic and first_neg[0] >= 0 else None
    return {
        "spec": spec.to_dict(),
        "mode": "deterministic" if deterministic else "monte_carlo",
        "calibration": calibration,
        "months": list(range(T + 1)),
        "buffer_percentiles": pct,
        "goal_fund_median": np.percentile(goal, 50, axis=0).tolist(),
        "income_median": np.percentile(income, 50, axis=0).tolist(),
        "spending_median": np.percentile(spend, 50, axis=0).tolist(),
        "prob_below_zero_any": float(below_any.mean()),
        "prob_below_zero_by_month": below_by_month,
        "median_min_buffer": float(np.median(min_buffer)),
        "p10_min_buffer": float(np.percentile(min_buffer, 10)),
        "median_end_buffer": float(np.median(buffer[:, -1])),
        "median_first_negative_month": (float(np.median(first_neg[first_neg >= 0])) if (first_neg >= 0).any() else None),
        "deterministic_month_cash_runs_out": det_month_out,
        "goal_reached_share": goal_reached_share,
        "goal_reached_month_median": goal_reached_month,
        "goal_target": st.goal_target,
        "median_total_contributed": float(np.median(contrib_log.sum(axis=1))),
        "n_paths": n_paths,
        "disclaimer": "Model output for a chosen scenario on anonymized data; not a forecast and not a real-world probability of the event. Historical cash flow resumes after the shock by assumption, not as a reemployment forecast. Monthly totals omit most within-month timing; upfront expenses are checked before that month's income.",
    }


def simulate_both(m: OfficialMetrics, spec: ScenarioSpec) -> dict:
    """Monte Carlo result plus the deterministic path for the same spec, plus the baseline fan for comparison."""
    mc = simulate(m, spec, deterministic=False)
    det = simulate(m, spec, deterministic=True)
    base_spec = ScenarioSpec(scenario_type="baseline", horizon_months=spec.horizon_months, n_paths=spec.n_paths,
                             seed=spec.seed, strategy=spec.strategy, label="Baseline")
    base = simulate(m, base_spec, deterministic=False)
    return {"scenario": mc, "deterministic": det, "baseline": base}


def branches(m: OfficialMetrics, horizon: int = 24, n_paths: int = 400, seed: int = 42,
             strategy: Optional[StrategyAdjust] = None) -> list[dict]:
    """The five branching futures shown on the 'paths' screen, each with its own summary."""
    out = []
    for key in ("baseline", "income_loss", "higher_costs", "positive_income", "combined"):
        spec = resolve_preset(key, m, horizon_months=horizon, n_paths=n_paths, seed=seed)
        if strategy:
            spec.strategy = strategy
        res = simulate(m, spec)
        det = simulate(m, spec, deterministic=True)
        out.append({
            "key": key, "label": spec.label, "spec": spec.to_dict(),
            "median_path": res["buffer_percentiles"]["p50"],
            "p10": res["buffer_percentiles"]["p10"], "p90": res["buffer_percentiles"]["p90"],
            "prob_below_zero_any": res["prob_below_zero_any"],
            "median_end_buffer": res["median_end_buffer"],
            "deterministic_end_buffer": det["buffer_percentiles"]["p50"][-1],
            "deterministic_month_cash_runs_out": det["deterministic_month_cash_runs_out"],
        })
    return out
