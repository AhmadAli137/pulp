"""Observed account patterns translated into questions and everyday decision contexts.

This is a deterministic interpretation layer, not a claim about merchants, employment,
transfer ownership, or which spending a person can cut. Rebuilt against confirmed context.
"""
from __future__ import annotations

import math


def build_decision_profile(monthly, row, summary: dict) -> dict:
    recent = monthly.sort_values("month").tail(6)
    net = recent["money_in"] - recent["money_out"]
    period = {"from": str(recent["month"].iloc[0]), "to": str(recent["month"].iloc[-1]), "months": len(recent)}
    full_period = {"from": str(monthly["month"].min()), "to": str(monthly["month"].max()), "months": len(monthly)}
    margin = round(float(net.median()), 2)
    constraints = {c.get("type"): c for c in summary.get("constraints", [])}
    observations = []
    def number(key):
        v = float(row.get(key, 0) or 0)
        return v if math.isfinite(v) else 0.0
    def add(key, evidence, meaning, question, unlocks, priority, constraint):
        observations.append({"key": key, "evidence": evidence, "life_effect": meaning,
            "question": question, "unlocks": unlocks, "priority": priority,
            "needs_answer": constraint not in constraints, "source": "observed account records", "period": period if key == "monthly_room" else full_period})
    add("monthly_room", f"In the latest {len(recent)} recorded months through {period['to']}, the median money left after outflows was ${margin:,.0f}; {int((net < 0).sum())} months ended with more going out than coming in.",
        "A new monthly commitment uses this room before there is anything left for a trip or an unexpected bill. Transfers may include savings, so this is account cash flow, not disposable income.",
        "Which regular costs must stay untouched, and is there anything you would willingly spend less on?",
        "Compare a recurring purchase with keeping that money for your goal.", 70, "can_free_up_per_month")
    if number("regular_transfer_out_amount") > 0:
        amount = number("regular_transfer_out_amount")
        add("transfer_purpose", f"The records show a recurring transfer of about ${amount:,.0f} per month out of this account.",
            "If this is accessible savings it may support your goal; if it pays rent, debt or family support, stopping it could cause harm.",
            f"What is that roughly ${amount:,.0f} transfer for: your own savings, a bill, or supporting someone?",
            "Decide whether this money is available at all before comparing changes to it.", 95, "transfer_purpose")
    if number("timing_dip_share") > 0 and number("neg_months_share") > 0:
        add("bill_timing", "Some recorded months went below zero even though total inflow covered total outflow.",
            "The order of payments may be the problem, rather than the amount you spend.",
            "Which bill arrives before your income, and can its payment date be changed?",
            "Compare asking to move that bill date with keeping a small payment buffer.", 90, "bill_date_flexibility")
    if number("pension_share") >= .75:
        add("income_options", "Most recorded inflow is labelled pension.",
            "Extra shifts or job-loss scenarios may not fit your life. A recurring price increase may be more relevant.",
            "Is this pension your only income, or is there other income we should include?",
            "Compare a smaller commitment or a later goal date without assuming you can work more.", 60, "other_income")
    if number("fee_share") > .005:
        add("fees", "Fees take a recurring share of recorded outflows.",
            "Avoidable fees could be a small improvement without giving up something you enjoy, but the fee conditions matter.",
            "Are these account fees, overdraft charges, or charges you cannot avoid?",
            "Compare eligible account options or a payment buffer after checking their conditions.", 75, "fee_conditions")
    goals = sorted(summary.get("goals", []), key=lambda g: g.get("priority", 1))
    questions = []
    if goals:
        goal = goals[0]
        if not goal.get("target_months"):
            questions.append({"key": "goal_timing", "text": "When would you like to take that vacation?" if goal.get("type") == "travel" else "When would you like to reach that goal?", "why": "Timing changes how much you would need to put aside each month.", "value": 1.3})
        elif not goal.get("target_amount"):
            questions.append({"key": "goal_amount", "text": "What total budget would feel comfortable for that vacation?" if goal.get("type") == "travel" else "What total amount should we plan for?", "why": "We need your budget before choosing a saving amount or suggesting cuts.", "value": 1.25})
    for o in sorted(observations, key=lambda o: -o["priority"]):
        if o["needs_answer"]:
            questions.append({"key": o["key"], "text": o["question"], "why": o["life_effect"], "value": o["priority"] / 100})
    small = [{"label": "Add a monthly expense or keep that money for your goal", "question": "What monthly purchase or service are you considering, and what would it cost?"}]
    if any(o["key"] == "bill_timing" for o in observations):
        small.insert(0, {"label": "Change a bill date or keep a payment buffer", "question": "Which bill would you want to move, and when does it leave?"})
    if goals:
        label = goals[0].get("label") or goals[0].get("type", "your goal").replace("_", " ")
        big = [{"label": f"{label}: keep the date, lower the budget, or wait longer", "question": questions[0]["text"] if questions else "Would you rather adjust the cost or the date?"}]
    else:
        big = [{"label": "A trip, a move, study, or a change in work", "question": "What bigger decision are you weighing up in your own life?"}]
    return {"period": period, "recent_monthly_room": margin, "lowest_recorded_monthly_room": round(float(net.min()), 2),
        "observations": observations, "questions": questions, "decisions": {"small": small, "big": big},
        "limits": ["These are historical records, not a live balance or a promise of affordability.",
                   "Card and cash totals do not identify optional purchases.",
                   "Transfers do not establish ownership, accessibility or purpose.",
                   "Confirm current income, essential costs and protected spending before treating an option as feasible."]}
