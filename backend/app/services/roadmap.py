"""Action roadmap derived from the official numbers, the stress plan and the recommended strategy.

Every action carries an amount (where applicable), the modeled effect, the goal it serves, trade-offs,
assumptions and a review trigger. Nothing is executed; these are suggestions for the customer to decide on.
"""
from __future__ import annotations

from .strategy_optimizer import compare_strategies
from .tangerine_metrics import OfficialMetrics, compute_shock, horizon_verdict, goal_plan, backup_plan


def build_roadmap(m: OfficialMetrics, context: dict, comparison: dict | None = None) -> dict:
    comparison = comparison or compare_strategies(m, context, n_paths=200)
    rec = next(s for s in comparison["strategies"] if s["key"] == comparison["recommended"])
    goal = comparison["goal"]
    I, S, H, B = m.typical_inflow, m.typical_spending, m.household_bills, m.buffer
    stress = comparison["stress_scenario"]
    duration = stress["shock_duration"]
    layoff = compute_shock(I, S, H, B, r=stress["income_fraction"], h=stress["bills_increase"], one_off=stress["one_off_cost"])
    verdict = horizon_verdict(layoff, duration)
    gp = goal_plan(layoff, duration)
    bp = backup_plan(layoff, duration)
    contrib = rec["monthly_contribution"]
    capacity = comparison["capacity_per_month"]
    ef_target = comparison["emergency_target"]
    ef_gap = max(0.0, ef_target - B)

    def action(title, amount, effect, goal_label, tradeoffs, assumptions, trigger):
        return {"action": title, "amount": amount, "expected_effect": effect, "goal": goal_label,
                "tradeoffs": tradeoffs, "assumptions": assumptions, "review_trigger": trigger}

    this_week = [
        action("Confirm your primary goal and timeline in the companion", None,
               "Turns the default emergency-fund goal into your own goal; the strategy comparison re-weights accordingly.",
               goal["label"], "Five minutes of input.", goal["assumption"], "Any time your goal or deadline changes."),
        action("Check which recurring bills are fixed", m.typical_fixed_costs,
               f"Fixed costs are ${m.typical_fixed_costs:,.0f} of ${S:,.0f} typical monthly spending; the rest is what could flex in a shock.",
               "Resilience", "None.", "Fixed = household bills + insurance + loan payments (median of monthly totals).",
               "When a bill changes by more than 10%."),
    ]
    this_month = []
    if contrib > 0:
        this_month.append(action(f"Set aside ${contrib:,.0f} this month ({rec['label']})", contrib,
                                 f"Modeled shortfall risk under stress {rec['prob_shortfall_under_stress']:.0%}; goal progress by deadline {rec['goal_progress_at_deadline']:.0%}.",
                                 goal["label"], "Less cash on hand for day-to-day spending this month.",
                                 comparison["capacity_assumption"], "If a month's inflow comes in under typical."))
    else:
        this_month.append(action("Identify what could be freed up each month", None,
                                 f"Typical surplus is ${I - S:,.0f}; the plan cannot allocate anything until spending drops below inflow or income rises.",
                                 goal["label"], "Requires a real change in spending or income.",
                                 "The data does not label discretionary spending; the amount must come from you.", "Review next month."))
    next_3 = [
        action("Hold an emergency floor before funding the goal" if comparison["recommended"] == "buffer_first" else "Track buffer against the stress target",
               ef_target, f"A ${ef_target:,.0f} buffer covers {duration} months of the selected stress scenario (gap ${max(0.0, layoff['monthly_gap']):,.0f}/month). Current buffer ${B:,.0f}; gap to target ${ef_gap:,.0f}.",
               "Resilience", "Goal progress is slower while the floor is being built." if comparison["recommended"] == "buffer_first" else "A lower floor means faster goal progress but more shortfall risk.",
               comparison["stress_label"], "If the buffer drops below two months of spending."),
        action("Backup plan if the shock hits", bp["monthly_improvement_needed"],
               bp["note"], "Resilience", "Freeing cash in a shock usually means pausing goal contributions.",
               "Sponsor runway formula; cash flows continue through the period.", "The day income changes."),
    ]
    next_year = [
        action(f"Reach {goal['label'].lower()} target", goal["target_amount"],
               (f"On the recommended plan the goal is reached in about {rec['months_to_goal_deterministic']:.0f} months" if rec["months_to_goal_deterministic"] else
                f"On the recommended plan the goal reaches {rec['goal_progress_at_deadline']:.0%} by month {min(goal['target_months'], comparison['horizon_months'])}") + ".",
               goal["label"], comparison["why"], goal["assumption"], "If income or spending moves by more than 10% for two months."),
    ]
    if not goal["target_amount"]:
        next_year = [action("Confirm your goal budget", None, "Completion cannot be assessed until an amount is confirmed.", goal["label"], "None.", goal["assumption"], "When you know the target cost.")]
    long_term = [
        action("Revisit the plan when life changes", None,
               "New goals, a move, a new job or a family change re-run the simulator and strategy comparison automatically after you confirm them.",
               goal["label"], "None.", "Context is only what you tell the companion; the bank data is a static snapshot.", "Any confirmed context update."),
    ]
    return {
        "account_id": m.account_id,
        "this_week": this_week, "this_month": this_month, "next_three_months": next_3,
        "next_year": next_year, "long_term": long_term,
        "summary": {"goal": goal, "recommended": rec["label"], "layoff_verdict": verdict["verdict"],
                    "goal_plan_note": gp["note"], "capacity_per_month": capacity},
    }
