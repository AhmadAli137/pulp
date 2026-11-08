"""One versioned planning result shared by conversation, goals and roadmap."""
from . import context_manager as cm


def current(account_id):
    ctx = cm.load_context(account_id)
    plan = ctx.get("active_plan")
    return {"plan": plan, "context_version": ctx["context_version"],
            "stale": bool(plan and plan["request"]["context_version"] != ctx["context_version"])}


def publish(account_id, plan):
    with cm._LOCK:
        ctx = cm.load_context(account_id)
        if plan["request"]["context_version"] != ctx["context_version"]:
            raise ValueError("Your context changed while planning. Please run the plan again.")
        ctx["active_plan"] = plan
        cm.save_context(ctx)
    return plan


def rerun(account_id, use_ai=True):
    from .financial_profiles import get_metrics
    from .council import run_council
    ctx = cm.load_context(account_id)
    previous = ctx.get("active_plan")
    if not previous:
        return None
    req = previous["request"]
    shock = req["shock"]
    return publish(account_id, run_council(account_id, get_metrics(account_id),
        r=shock["r"], h=shock["h"], one_off=shock["one_off"], duration=shock["duration_months"],
        horizon=req["horizon_months"], use_ai=use_ai))


def comparison(plan):
    req = plan["request"]
    strategies = []
    for c in plan["ranked"]:
        strategies.append({**c, "key": c["label"], "feasible": True,
            "monthly_contribution": c["levers"]["goal_contribution_per_month"],
            "freed_up_per_month": c["levers"]["freed_up_per_month"],
            "emergency_floor": c["levers"]["emergency_floor"], "goal_reached_share_mc": None,
            "infeasible_reason": None})
    best = strategies[0]
    sh = req["shock"]
    return {"account_id": plan["account_id"], "goal": req["goal"], "strategies": strategies,
        "recommended": plan["recommended"], "why": plan["why"], "weights": req["weights"],
        "stress_label": sh["label"], "stress_scenario": {"income_fraction": sh["r"],
            "bills_increase": sh["h"], "one_off_cost": sh["one_off"], "shock_duration": sh["duration_months"]},
        "capacity_per_month": best["monthly_contribution"], "capacity_assumption": "Selected council plan under your active scenario; proposed changes require your judgement.",
        "emergency_target": req["stress_need"], "horizon_months": req["horizon_months"]}
