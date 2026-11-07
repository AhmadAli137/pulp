"""Compare feasible saving strategies for an account given its confirmed life context.

Strategies are explicit dollar rules run through the scenario engine under a stress scenario.
The recommendation maximises a weighted score whose weights come from the user's stated preferences;
the weights are shown, so a changed recommendation can always be traced to a changed input.
Nothing here is a trained model.
"""
from __future__ import annotations

from dataclasses import replace

from .scenario_engine import ScenarioSpec, StrategyAdjust, simulate
from .tangerine_metrics import OfficialMetrics, compute_shock

GOAL_LABELS = {
    "emergency_fund": "Emergency fund", "move_out": "Move out", "home_purchase": "Buy a home",
    "entrepreneurship": "Start a business", "education": "Education or retraining", "vehicle": "Buy a vehicle",
    "travel": "Travel", "wedding": "Wedding", "debt_payoff": "Pay off debt", "retirement": "Retirement",
    "family": "Family", "other": "Goal",
}

DEFAULT_GOAL_MONTHS = {
    "emergency_fund": 12, "move_out": 12, "home_purchase": 60, "entrepreneurship": 18, "education": 24,
    "vehicle": 18, "travel": 12, "wedding": 18, "debt_payoff": 24, "retirement": 120, "family": 24, "other": 24,
}


def _primary_goal(context: dict, m: OfficialMetrics, stress_need: float) -> dict:
    """Pick the primary confirmed goal; default to the emergency fund the stress scenario needs."""
    goals = [g for g in context.get("goals", []) if g.get("confirmed", True)]
    goals.sort(key=lambda g: (g.get("value", {}).get("priority", 2), g.get("created_at", "")))
    if goals:
        v = dict(goals[0]["value"])
        gtype = v.get("type", "other")
        amount = v.get("target_amount")
        months = v.get("target_months") or DEFAULT_GOAL_MONTHS.get(gtype, 24)
        if not amount:
            # No amount stated: use a transparent default and label it as an assumption.
            amount = stress_need if gtype == "emergency_fund" else max(3.0 * m.typical_spending, 1000.0)
            assumption = (f"No target amount stated; assumed {GOAL_LABELS.get(gtype, 'goal')} target = "
                          f"{'the stress-scenario need' if gtype == 'emergency_fund' else '3 months of typical spending'} (${amount:,.0f}).")
        else:
            assumption = "Target amount confirmed by the user."
        return {"type": gtype, "label": v.get("label") or GOAL_LABELS.get(gtype, "Goal"), "target_amount": float(amount),
                "target_months": int(months), "source": goals[0].get("source", "user_confirmed"), "assumption": assumption}
    return {"type": "emergency_fund", "label": "Emergency fund for a six-month layoff", "target_amount": float(stress_need),
            "target_months": 12, "source": "default",
            "assumption": "No goal confirmed yet; default goal is the buffer needed to survive the layoff scenario (C + 6 x gap)."}


def _stress_spec(context: dict, m: OfficialMetrics, horizon: int, n_paths: int, seed: int) -> ScenarioSpec:
    """Stress scenario shaped by stated concerns (income loss is the default stress)."""
    concerns = {c.get("value", {}).get("type") for c in context.get("concerns", []) if c.get("confirmed", True)}
    r, h = 0.55, 0.0
    label = "Stress: layoff at 55% for 6 months starting month 3"
    if "rising_costs" in concerns or "rent_increase" in concerns:
        h = 0.15
        label = "Stress: layoff at 55% for 6 months and bills up 15%"
    if "irregular_income" in concerns and "income_loss" not in concerns:
        r, label = 0.70, "Stress: income drops to 70% for 6 months (irregular income) starting month 3"
    return ScenarioSpec(scenario_type="stress", income_fraction=r, bills_increase=h, shock_start=3, shock_duration=6,
                        horizon_months=horizon, n_paths=n_paths, seed=seed, label=label)


def _weights(context: dict) -> dict:
    prefs = {p.get("value", {}).get("type"): p.get("value", {}) for p in context.get("preferences", []) if p.get("confirmed", True)}
    concerns = {c.get("value", {}).get("type") for c in context.get("concerns", []) if c.get("confirmed", True)}
    w_res, w_goal = 0.5, 0.5
    reasons = ["Default: safety and goal speed weighted equally."]
    rp = prefs.get("risk_preference", {}).get("choice") if "risk_preference" in prefs else None
    if rp == "safety":
        w_res, w_goal = 0.7, 0.3
        reasons = ["You said you would rather keep a larger safety buffer: safety weighted 70%."]
    elif rp == "speed":
        w_res, w_goal = 0.3, 0.7
        reasons = ["You said you would rather reach the goal faster: goal speed weighted 70%."]
    if "income_loss" in concerns or "irregular_income" in concerns:
        w_res = min(0.85, w_res + 0.1)
        w_goal = 1 - w_res
        reasons.append("You are worried about income interruption: +10% weight on not running out of cash.")
    return {"resilience": w_res, "goal": w_goal, "reasons": reasons}


def compare_strategies(m: OfficialMetrics, context: dict, *, horizon: int = 24, n_paths: int = 400, seed: int = 42) -> dict:
    I, S, B = m.typical_inflow, m.typical_spending, m.buffer
    surplus = max(0.0, I - S)
    constraints = {c.get("value", {}).get("type"): c.get("value", {}) for c in context.get("constraints", []) if c.get("confirmed", True)}
    can_free = float(constraints.get("can_free_up_per_month", {}).get("amount", 0.0) or 0.0)
    capacity = surplus + can_free

    layoff = compute_shock(I, S, m.household_bills, B, r=0.55)
    stress_need = 6 * max(0.0, layoff["monthly_gap"])
    goal = _primary_goal(context, m, stress_need)
    spec = _stress_spec(context, m, horizon, n_paths, seed)
    weights = _weights(context)
    emergency_target = max(stress_need, 0.0)

    defs = [
        ("stay", "Stay the course", StrategyAdjust(label="Stay the course")),
        ("buffer_first", "Buffer first, then goal",
         StrategyAdjust(label="Buffer first", freed_up_per_month=can_free, goal_contribution_per_month=capacity,
                        goal_target=goal["target_amount"], emergency_floor=emergency_target)),
        ("goal_first", "Goal first",
         StrategyAdjust(label="Goal first", freed_up_per_month=can_free, goal_contribution_per_month=capacity,
                        goal_target=goal["target_amount"], emergency_floor=0.0)),
        ("balanced", "Balanced split",
         StrategyAdjust(label="Balanced", freed_up_per_month=can_free, goal_contribution_per_month=0.5 * capacity,
                        goal_target=goal["target_amount"], emergency_floor=0.5 * emergency_target)),
    ]
    results = []
    for key, label, strat in defs:
        feasible = key == "stay" or capacity > 0
        s = replace(spec, strategy=strat, label=label)
        res = simulate(m, s)
        res_det = simulate(m, s, deterministic=True)
        p_short = res["prob_below_zero_any"]
        # goal progress by the deadline (deterministic path, capped at horizon)
        deadline = min(goal["target_months"], horizon)
        goal_at_deadline = res_det["goal_fund_median"][deadline] if goal["target_amount"] > 0 else 0.0
        progress = min(1.0, goal_at_deadline / goal["target_amount"]) if goal["target_amount"] > 0 else 0.0
        months_to_goal = res_det.get("goal_reached_month_median")
        score = weights["resilience"] * (1 - p_short) + weights["goal"] * progress if feasible else -1.0
        results.append({
            "key": key, "label": label, "feasible": feasible,
            "monthly_contribution": strat.goal_contribution_per_month, "freed_up_per_month": strat.freed_up_per_month,
            "emergency_floor": strat.emergency_floor,
            "prob_shortfall_under_stress": p_short,
            "median_min_buffer": res["median_min_buffer"],
            "median_end_buffer": res["median_end_buffer"],
            "goal_progress_at_deadline": progress,
            "goal_amount_at_deadline": goal_at_deadline,
            "months_to_goal_deterministic": months_to_goal,
            "goal_reached_share_mc": res["goal_reached_share"],
            "buffer_median_path": res["buffer_percentiles"]["p50"],
            "goal_median_path": res["goal_fund_median"],
            "score": score,
            "infeasible_reason": None if feasible else f"Typical spending is at or above inflow; nothing to allocate unless ${max(50.0, abs(I - S)):,.0f}/month is freed up.",
        })
    feasible = [r for r in results if r["feasible"]]
    best = max(feasible, key=lambda r: (round(r["score"], 4), -r["prob_shortfall_under_stress"]))
    runner = sorted(feasible, key=lambda r: -r["score"])[1] if len(feasible) > 1 else None
    why = (f"'{best['label']}' scores {best['score']:.2f} = {weights['resilience']:.0%} x (1 - {best['prob_shortfall_under_stress']:.0%} shortfall risk) "
           f"+ {weights['goal']:.0%} x {best['goal_progress_at_deadline']:.0%} goal progress by month {min(goal['target_months'], horizon)}.")
    if runner:
        why += f" Runner-up '{runner['label']}' scores {runner['score']:.2f}."
    return {
        "account_id": m.account_id,
        "goal": goal,
        "stress_scenario": spec.to_dict(),
        "stress_label": spec.label,
        "weights": weights,
        "capacity_per_month": capacity,
        "capacity_assumption": ("Capacity = typical surplus (I - S)" + (f" + ${can_free:,.0f}/month you said you could free up" if can_free else "")
                                + ". The data does not label discretionary spending."),
        "emergency_target": emergency_target,
        "strategies": results,
        "recommended": best["key"],
        "why": why,
        "horizon_months": horizon,
    }
