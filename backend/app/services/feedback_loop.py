"""The closed loop: new context -> digital twin update -> replan -> explain what changed.

replan() runs the strategy comparison with the current confirmed context, stores a snapshot, and
diffs it against the previous snapshot. If nothing material changed, it says so explicitly.
"""
from __future__ import annotations

from . import context_manager as cm
from .financial_profiles import get_metrics
from .strategy_optimizer import compare_strategies

MATERIAL_SHORTFALL_DELTA = 0.05   # 5 percentage points
MATERIAL_MONEY_DELTA = 0.10       # 10% change in a dollar target


def _snapshot_from(result: dict, ctx: dict) -> dict:
    rec = next(s for s in result["strategies"] if s["key"] == result["recommended"])
    return {
        "recommended": result["recommended"],
        "recommended_label": rec["label"],
        "goal": result["goal"],
        "emergency_target": result["emergency_target"],
        "stress_label": result["stress_label"],
        "weights": result["weights"],
        "prob_shortfall_under_stress": rec["prob_shortfall_under_stress"],
        "months_to_goal": rec["months_to_goal_deterministic"],
        "goal_progress_at_deadline": rec["goal_progress_at_deadline"],
        "monthly_contribution": rec["monthly_contribution"],
        "buffer_median_path": rec["buffer_median_path"],
        "goal_median_path": rec["goal_median_path"],
        "context_summary": cm.summarize(ctx),
        "strategies_brief": [{k: s[k] for k in ("key", "label", "feasible", "score", "prob_shortfall_under_stress",
                                                   "goal_progress_at_deadline", "months_to_goal_deterministic")} for s in result["strategies"]],
    }


def diff_snapshots(old: dict | None, new: dict) -> dict:
    if old is None:
        return {"has_previous": False, "materially_changed": True, "reasons": ["First plan for this account."], "changes": {}}
    changes = {}
    reasons = []

    def rec(key, o, n, label, fmt=lambda x: x):
        if o != n:
            changes[key] = {"old": o, "new": n, "label": label}

    rec("goal", old["goal"]["label"], new["goal"]["label"], "Primary goal")
    rec("goal_amount", old["goal"]["target_amount"], new["goal"]["target_amount"], "Goal target amount")
    rec("goal_months", old["goal"]["target_months"], new["goal"]["target_months"], "Goal timeline (months)")
    rec("emergency_target", old["emergency_target"], new["emergency_target"], "Emergency-fund target")
    rec("stress", old["stress_label"], new["stress_label"], "Stress scenario")
    rec("weights", old["weights"], new["weights"], "Decision weights")
    rec("recommended", old["recommended_label"], new["recommended_label"], "Recommended strategy")
    rec("prob_shortfall", old["prob_shortfall_under_stress"], new["prob_shortfall_under_stress"], "Modeled shortfall frequency")
    rec("months_to_goal", old["months_to_goal"], new["months_to_goal"], "Months to goal")
    rec("monthly_contribution", old["monthly_contribution"], new["monthly_contribution"], "Monthly contribution")

    material = False
    if old["recommended"] != new["recommended"]:
        material = True
        reasons.append(f"Recommended strategy changed from '{old['recommended_label']}' to '{new['recommended_label']}'.")
    if old["goal"]["label"] != new["goal"]["label"]:
        material = True
        reasons.append(f"Primary goal changed from '{old['goal']['label']}' to '{new['goal']['label']}'.")
    if abs(old["prob_shortfall_under_stress"] - new["prob_shortfall_under_stress"]) >= MATERIAL_SHORTFALL_DELTA:
        material = True
        reasons.append(f"Modeled shortfall frequency moved from {old['prob_shortfall_under_stress']:.0%} to {new['prob_shortfall_under_stress']:.0%}.")
    ot, nt = old["emergency_target"], new["emergency_target"]
    if ot and abs(nt - ot) / max(ot, 1) >= MATERIAL_MONEY_DELTA:
        material = True
        reasons.append(f"Emergency-fund target moved from ${ot:,.0f} to ${nt:,.0f}.")
    if old["stress_label"] != new["stress_label"]:
        material = True
        reasons.append(f"Stress scenario changed: {new['stress_label']}.")
    if old["weights"] != new["weights"]:
        reasons.append("Decision weights changed: " + " ".join(new["weights"]["reasons"]))
    if (old["goal"]["target_months"] != new["goal"]["target_months"]) or (old["goal"]["target_amount"] != new["goal"]["target_amount"]):
        reasons.append(f"Goal target is now ${new['goal']['target_amount']:,.0f} in {new['goal']['target_months']} months.")
    if not material:
        reasons.insert(0, "The new context does not materially change the optimal strategy; the recommendation stands.")
    return {"has_previous": True, "materially_changed": material, "reasons": reasons, "changes": changes}


def replan(account_id: int, reason: str = "context updated") -> dict:
    m = get_metrics(account_id)
    from .planning_session import rerun
    rerun(account_id)
    ctx = cm.load_context(account_id)
    result = compare_strategies(m, ctx)
    snap = _snapshot_from(result, ctx)
    previous = ctx["strategy_snapshots"][-1] if ctx["strategy_snapshots"] else None
    diff = diff_snapshots(previous, snap)
    snap["trigger"] = reason
    snap["diff_vs_previous"] = {k: v for k, v in diff.items() if k != "changes"} | {"changes": diff["changes"]}
    stored = cm.add_snapshot(account_id, snap)
    return {"account_id": int(account_id), "comparison": result, "snapshot": stored, "previous": previous, "diff": diff}


def replanning_diff(account_id: int) -> dict:
    ctx = cm.load_context(account_id)
    snaps = ctx["strategy_snapshots"]
    if not snaps:
        return {"account_id": int(account_id), "has_previous": False, "current": None, "previous": None, "diff": None,
                "note": "No plan has been generated yet. Run /api/replan or confirm a context update."}
    cur = snaps[-1]
    prev = snaps[-2] if len(snaps) > 1 else None
    return {"account_id": int(account_id), "has_previous": prev is not None, "current": cur, "previous": prev,
            "diff": diff_snapshots(prev, cur)}
